"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Icons } from "../../components/icons";
import { ClearSearchButton, Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import type { MemberRole, MemberStatus } from "../../../lib/auth/permissions";
import { memberDisplayName } from "../../../lib/members/display";
import { resolveAvatarUrl } from "../../../lib/members/avatar";
import {
  createMember,
  addMemberRelationship,
  removeMemberRelationship,
  softDeleteMember,
  setMemberStatus,
  revokeMemberLogin,
  restoreMemberLogin,
  type RelationshipKind,
} from "../../../lib/auth/member-actions";
import { MemberEditForm } from "./MemberEditForm";
import { ComboSelect } from "../../components/ComboSelect";

interface Member {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
  status: MemberStatus;
  role: MemberRole;
  can_edit_settings: boolean;
  can_delete_settings: boolean;
  can_undelete_settings: boolean;
  can_manage_finances: boolean;
  can_manage_registrations: boolean;
  // Travel grant (0110), loaded on its own; false before the migration.
  can_manage_travel: boolean;
  // Slack DMs grant (0118), loaded the same way.
  can_slack_dm: boolean;
  membership_status: string;
  access_revoked_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

type GrantKey =
  | "can_edit_settings"
  | "can_delete_settings"
  | "can_undelete_settings"
  | "can_manage_finances"
  | "can_manage_registrations"
  | "can_manage_travel"
  | "can_slack_dm";

// Pending splits in two: people who signed in and asked (the approval queue),
// and registered parents pre-created from a player registration who haven't
// signed up yet. A super-admin can approve either; the first gets in on their
// next sign-in, the second as soon as they sign up.
type TabKey = MemberStatus | "invited";

function inTab(m: Member, t: TabKey): boolean {
  if (t === "invited") return m.status === "pending" && !m.user_id;
  if (t === "pending") return m.status === "pending" && !!m.user_id;
  return m.status === t;
}

interface Relationship {
  id: string;
  member_id: string;
  related_member_id: string;
  relationship: RelationshipKind;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function MembersTab({
  currentUserId,
  canManage,
}: {
  currentUserId: string;
  // Super-admins manage roles, edit details, and remove members; board
  // admins (canManage=false) work the approve/deny queue only.
  canManage: boolean;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  // The Travel grant needs migration 0110; until then it isn't offered.
  const [travelReady, setTravelReady] = useState(false);
  // The Slack DMs grant needs migration 0118, the same way.
  const [slackReady, setSlackReady] = useState(false);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [
      { data: m, error: mErr },
      { data: r, error: rErr },
      { data: t, error: tErr },
      { data: sd, error: sdErr },
    ] = await Promise.all([
      supabase
        .from("members")
        .select(
          "id, user_id, email, full_name, nickname, avatar_url, phone, birthday, status, role, can_edit_settings, can_delete_settings, can_undelete_settings, can_manage_finances, can_manage_registrations, membership_status, access_revoked_at, requested_at, reviewed_at"
        )
        .is("deleted_at", null)
        .order("requested_at", { ascending: false }),
      supabase
        .from("member_relationships")
        .select("id, member_id, related_member_id, relationship"),
      // The Travel grant (0110), best-effort so the tab loads before it.
      supabase.from("members").select("id, can_manage_travel").is("deleted_at", null),
      // The Slack DMs grant (0118), the same way.
      supabase.from("members").select("id, can_slack_dm").is("deleted_at", null),
    ]);
    if (mErr || rErr) setError(mErr?.message ?? rErr?.message ?? "Failed to load");
    else {
      const travel = new Map(((t as { id: string; can_manage_travel: boolean }[] | null) ?? []).map((x) => [x.id, !!x.can_manage_travel]));
      const slack = new Map(((sd as { id: string; can_slack_dm: boolean }[] | null) ?? []).map((x) => [x.id, !!x.can_slack_dm]));
      setTravelReady(!tErr);
      setSlackReady(!sdErr);
      setMembers(
        ((m as Omit<Member, "can_manage_travel" | "can_slack_dm">[]) ?? []).map((x) => ({
          ...x,
          can_manage_travel: travel.get(x.id) ?? false,
          can_slack_dm: slack.get(x.id) ?? false,
        }))
      );
      setRelationships((r as Relationship[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: MemberStatus) {
    setActing(id);
    setError(null);
    // Server action: enforces the staff check server-side and emails the
    // member on approval.
    const result = await setMemberStatus(id, status);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  async function setRole(id: string, role: MemberRole) {
    setActing(id);
    setError(null);
    const supabase = createClient();
    // Settings grants only apply to Board (admin). Clear them when
    // moving to any other group, so they don't linger on a plain member or
    // reappear if the person is later re-promoted. (Super-admins hold every
    // grant implicitly, so they don't need the flags.)
    const { error: updateError } = await supabase
      .from("members")
      .update({
        role,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
        ...(role !== "admin"
          ? { can_edit_settings: false, can_delete_settings: false, can_undelete_settings: false }
          : {}),
      })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  // Set a member's permission group, confirming the sensitive transitions
  // (granting or removing Super-admin). Self is never editable here, so the
  // acting super-admin can't demote themselves and lock everyone out.
  async function changeRole(member: Member, role: MemberRole) {
    if (role === member.role) return;
    if (role === "super_admin") {
      if (
        !confirm(
          `Make ${memberDisplayName(member)} a Super-admin? They'll have full control — managing members, roles, and every setting.`
        )
      )
        return;
    } else if (member.role === "super_admin") {
      const to = role === "admin" ? "Board" : "Member";
      if (!confirm(`Remove Super-admin from ${memberDisplayName(member)} and set them to ${to}?`)) return;
    }
    await setRole(member.id, role);
  }

  // Toggle a settings grant on a board member. RLS allows only super-admins
  // to update member rows (same path as setRole), so this is super-admin only.
  async function setGrant(id: string, key: GrantKey, value: boolean) {
    setActing(id);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("members").update({ [key]: value }).eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  async function removeMember(id: string) {
    if (
      !confirm(
        "Delete this member? They'll move to Settings → Deleted, where you can restore or permanently remove them."
      )
    )
      return;
    setActing(id);
    setError(null);
    const result = await softDeleteMember(id);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  async function saveMemberDetails(
    id: string,
    fields: {
      full_name: string | null;
      nickname: string | null;
      avatar_url: string | null;
      phone: string | null;
      birthday: string | null;
      email: string | null;
      membership_status: string;
    }
  ) {
    setActing(id);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("members")
      .update(fields)
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  async function revokeLogin(id: string, membershipStatus: "moved" | "inactive") {
    setActing(id);
    setError(null);
    const result = await revokeMemberLogin(id, membershipStatus);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  async function restoreLogin(id: string) {
    setActing(id);
    setError(null);
    const result = await restoreMemberLogin(id);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  async function handleCreateMember(input: {
    fullName: string;
    email: string;
    phone: string;
    birthday: string;
    role: MemberRole;
    status: MemberStatus;
  }) {
    setError(null);
    const result = await createMember({
      fullName: input.fullName,
      email: input.email || null,
      phone: input.phone || null,
      birthday: input.birthday || null,
      role: input.role,
      status: input.status,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleAddRelationship(
    memberId: string,
    relatedMemberId: string,
    kind: RelationshipKind
  ) {
    setError(null);
    setActing(memberId);
    const result = await addMemberRelationship(memberId, relatedMemberId, kind);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  async function handleRemoveRelationship(
    memberId: string,
    relatedMemberId: string,
    kind: RelationshipKind
  ) {
    setError(null);
    setActing(memberId);
    const result = await removeMemberRelationship(memberId, relatedMemberId, kind);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  const byStatus = (t: TabKey) => members.filter((m) => inTab(m, t));
  const counts = {
    pending: byStatus("pending").length,
    approved: byStatus("approved").length,
    denied: byStatus("denied").length,
    invited: byStatus("invited").length,
  };
  const q = query.trim().toLowerCase();
  const visibleInTab = q
    ? byStatus(tab).filter((m) =>
        ((m.full_name ?? "").toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q))
      )
    : byStatus(tab);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
    { key: "invited", label: "Not signed up" },
  ];

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Header row with Add button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 480 }}>
          {canManage
            ? "Pre-create a member to seed a sign-in (they'll set their password via /register using the email you enter), or add them with no email as a directory entry for family relationships."
            : "Approve or deny access requests. New members are emailed when you approve them."}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canManage && !adding && (
            <span data-tour="members-add" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Icons.Plus width={14} height={14} /> Add member
              </Pill>
            </span>
          )}
        </div>
      </div>

      {adding && (
        <div style={{ marginBottom: 16 }}>
          <AddMemberForm
            onCancel={() => {
              setAdding(false);
              setError(null);
            }}
            onSubmit={handleCreateMember}
          />
        </div>
      )}

      {/* Search */}
      <div data-tour="members-search" style={{ position: "relative", marginBottom: 14 }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--gw-fg-muted)",
            display: "flex",
          }}
        >
          <Icons.Search width={14} height={14} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          style={{
            width: "100%",
            height: 36,
            padding: "0 40px 0 36px",
            borderRadius: 10,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg)",
            color: "var(--gw-fg)",
            fontSize: 13,
            fontWeight: 500,
          }}
        />
        {query && <ClearSearchButton onClear={() => setQuery("")} />}
      </div>

      {/* Status sub-tabs */}
      <div data-tour="members-status" style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 8,
              background: tab === t.key ? "var(--gw-bg-elev)" : "transparent",
              border: "1px solid",
              borderColor: tab === t.key ? "var(--gw-border)" : "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: tab === t.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
              cursor: "pointer",
              transition: "all 120ms",
            }}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span
                style={{
                  background: t.key === "pending" ? "var(--rsd-error-fill)" : "var(--gw-bg)",
                  color: t.key === "pending" ? "#fff" : "var(--gw-fg-muted)",
                  border: t.key !== "pending" ? "1px solid var(--gw-border)" : "none",
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: 100,
                  padding: "1px 6px",
                  lineHeight: 1.6,
                }}
              >
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : visibleInTab.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {q
              ? `No matches for "${query}" in ${tab}.`
              : tab === "pending"
              ? "No pending requests"
              : tab === "approved"
              ? "No approved members yet"
              : tab === "invited"
              ? "Every parent on a registration has signed up"
              : "No denied requests"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {q && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, marginBottom: 2 }}>
              {visibleInTab.length} of {byStatus(tab).length} match
            </div>
          )}
          {visibleInTab.map((member) =>
            editingId === member.id ? (
              <MemberEditForm
                key={member.id}
                member={member}
                allMembers={members}
                relationships={relationships}
                pending={acting === member.id}
                onCancel={() => setEditingId(null)}
                onSave={async (fields) => {
                  await saveMemberDetails(member.id, fields);
                  setEditingId(null);
                }}
                onAddRelationship={(relatedId, kind) =>
                  handleAddRelationship(member.id, relatedId, kind)
                }
                onRemoveRelationship={(relatedId, kind) =>
                  handleRemoveRelationship(member.id, relatedId, kind)
                }
                onRevokeLogin={
                  tab === "approved" && member.user_id !== currentUserId
                    ? (status) => revokeLogin(member.id, status)
                    : undefined
                }
                onRestoreLogin={
                  tab === "approved" && member.user_id !== currentUserId
                    ? () => restoreLogin(member.id)
                    : undefined
                }
                onDelete={
                  member.user_id === currentUserId
                    ? undefined
                    : async () => {
                        setEditingId(null);
                        await removeMember(member.id);
                      }
                }
              />
            ) : (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.user_id === currentUserId}
                tab={tab === "invited" ? "pending" : tab}
                acting={acting === member.id}
                canManage={canManage}
                travelReady={travelReady}
                slackReady={slackReady}
                onApprove={() => setStatus(member.id, "approved")}
                onDeny={() => setStatus(member.id, "denied")}
                onRestore={() => setStatus(member.id, "pending")}
                onRemove={() => removeMember(member.id)}
                onSetRole={(role) => changeRole(member, role)}
                onSetGrant={(key, value) => setGrant(member.id, key, value)}
                onEdit={() => setEditingId(member.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// Compact permission-group picker for the member row. Super-admin only (the
// row only renders it when canManage). Lets a super-admin move anyone directly
// into any of the three groups.
function RoleSelect({
  role,
  disabled,
  onChange,
}: {
  role: MemberRole;
  disabled: boolean;
  onChange: (role: MemberRole) => void;
}) {
  return (
    <ComboSelect
      value={role}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as MemberRole)}
      aria-label="Permission group"
      title="Permission group"
      style={{
        height: 30,
        padding: "0 26px 0 10px",
        borderRadius: 8,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: "var(--gw-fg)",
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <option value="member">Member</option>
      <option value="admin">Board</option>
      <option value="super_admin">Super-admin</option>
    </ComboSelect>
  );
}

function MemberRow({
  member,
  isSelf,
  tab,
  acting,
  canManage,
  travelReady,
  slackReady,
  onApprove,
  onDeny,
  onRestore,
  onRemove,
  onSetRole,
  onSetGrant,
  onEdit,
}: {
  member: Member;
  isSelf: boolean;
  tab: MemberStatus;
  acting: boolean;
  canManage: boolean;
  travelReady: boolean;
  slackReady: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onSetRole: (role: MemberRole) => void;
  onSetGrant: (key: GrantKey, value: boolean) => void;
  onEdit: () => void;
}) {
  const rowAvatar = resolveAvatarUrl(member);
  return (
    <div
      data-tour="members-row"
      className="rsd-card"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        opacity: acting ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          flexShrink: 0,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {rowAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={rowAvatar} alt="" width={40} height={40} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
        ) : (
          <Icons.User width={18} height={18} style={{ color: "var(--gw-fg-muted)" }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.2, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
            {memberDisplayName(member)}
          </span>
          {member.role === "super_admin" && (
            <span className="rsd-chip rsd-chip-accent">Super-admin</span>
          )}
          {member.role === "admin" && <span className="rsd-chip rsd-chip-mute">Board</span>}
          {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
          {member.access_revoked_at ? (
            <span className="rsd-chip rsd-chip-warn">No login</span>
          ) : !member.email ? (
            <span className="rsd-chip rsd-chip-mute">Directory only</span>
          ) : !member.user_id ? (
            <span className="rsd-chip rsd-chip-warn">Invited</span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 2,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {member.email && (
            <>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {member.email}
              </span>
              <span style={{ flexShrink: 0 }}>·</span>
            </>
          )}
          <span style={{ flexShrink: 0 }}>
            {tab === "pending"
              ? `Requested ${timeAgo(member.requested_at)}`
              : `Reviewed ${timeAgo(member.reviewed_at ?? member.requested_at)}`}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {canManage && (
          <ActionBtn onClick={onEdit} disabled={acting} color="var(--gw-fg)" bgColor="var(--gw-bg-elev)">
            Edit
          </ActionBtn>
        )}
        {tab === "pending" && (
          <>
            <ActionBtn onClick={onApprove} disabled={acting} color="var(--rsd-accent)" bgColor="var(--rsd-accent-bg)">
              Approve
            </ActionBtn>
            <ActionBtn onClick={onDeny} disabled={acting} color="var(--gw-error)" bgColor="var(--gw-error-bg)">
              Deny
            </ActionBtn>
          </>
        )}
        {tab === "approved" && canManage && (
          <>
            {!isSelf && (
              <RoleSelect role={member.role} disabled={acting} onChange={onSetRole} />
            )}
            {!isSelf && member.role !== "super_admin" && (
              <ActionBtn
                onClick={onRemove}
                disabled={acting}
                color="var(--gw-error)"
                bgColor="var(--gw-error-bg)"
              >
                Remove
              </ActionBtn>
            )}
          </>
        )}
        {/* Settings grants — what this board member may change in Settings. */}
        {tab === "approved" && canManage && member.role === "admin" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", width: "100%", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Settings:
            </span>
            <GrantChip label="Edit" on={member.can_edit_settings} disabled={acting} onClick={() => onSetGrant("can_edit_settings", !member.can_edit_settings)} />
            <GrantChip label="Delete" on={member.can_delete_settings} disabled={acting} onClick={() => onSetGrant("can_delete_settings", !member.can_delete_settings)} />
            <GrantChip label="Undelete" on={member.can_undelete_settings} disabled={acting} onClick={() => onSetGrant("can_undelete_settings", !member.can_undelete_settings)} />
          </div>
        )}
        {/* Payments, Registrations, Travel and Slack DMs grants — any approved
            member, board or not (the Treasurer; whoever runs registrations; the
            travel coordinator; coaches). Super-admins always have them all. */}
        {tab === "approved" && canManage && member.role !== "super_admin" && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", width: "100%", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Manages:
            </span>
            <GrantChip
              label="Payments"
              title={member.can_manage_finances ? "Can see every family's balance and record payments — tap to revoke" : "Tap to let them see every family's balance and record payments"}
              on={member.can_manage_finances}
              disabled={acting}
              onClick={() => onSetGrant("can_manage_finances", !member.can_manage_finances)}
            />
            <GrantChip
              label="Registrations"
              title={
                member.can_manage_registrations
                  ? "Can review registrations, put players on teams and edit players — tap to revoke"
                  : "Tap to let them review registrations, put players on teams and edit players"
              }
              on={member.can_manage_registrations}
              disabled={acting}
              onClick={() => onSetGrant("can_manage_registrations", !member.can_manage_registrations)}
            />
            {travelReady && (
              <GrantChip
                label="Travel"
                title={
                  member.can_manage_travel
                    ? "Keeps the hotels and places to eat in External Contacts — tap to revoke"
                    : "Tap to let them add and edit the hotels and places to eat in External Contacts"
                }
                on={member.can_manage_travel}
                disabled={acting}
                onClick={() => onSetGrant("can_manage_travel", !member.can_manage_travel)}
              />
            )}
            {slackReady && (
              <GrantChip
                label="Slack DMs"
                title={
                  member.can_slack_dm
                    ? "Can send Slack DMs to families from the Directory, as themselves — tap to revoke"
                    : "Tap to let them send Slack DMs to the families of the players they can see in the Directory, as themselves"
                }
                on={member.can_slack_dm}
                disabled={acting}
                onClick={() => onSetGrant("can_slack_dm", !member.can_slack_dm)}
              />
            )}
          </div>
        )}
        {tab === "denied" && (
          <>
            <ActionBtn onClick={onApprove} disabled={acting} color="var(--rsd-accent)" bgColor="var(--rsd-accent-bg)">
              Approve
            </ActionBtn>
            <ActionBtn onClick={onRestore} disabled={acting} color="var(--gw-fg-muted)" bgColor="var(--gw-bg-elev)">
              Restore to pending
            </ActionBtn>
            {canManage && (
            <ActionBtn onClick={onRemove} disabled={acting} color="var(--gw-error)" bgColor="var(--gw-error-bg)">
              Remove
            </ActionBtn>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  color,
  bgColor,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  color: string;
  bgColor: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        background: bgColor,
        color,
        border: `1px solid ${color}33`,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 120ms",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// A grant toggle for a board member — green when held, outline when not.
function GrantChip({
  label,
  title,
  on,
  disabled,
  onClick,
}: {
  label: string;
  title?: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title ?? (on ? `Can ${label.toLowerCase()} — tap to revoke` : `Tap to allow ${label.toLowerCase()}`)}
      style={{
        padding: "5px 11px",
        borderRadius: 100,
        fontSize: 11.5,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg)",
        color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
        border: `1px solid ${on ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
        whiteSpace: "nowrap",
      }}
    >
      {on ? "✓ " : ""}{label}
    </button>
  );
}


function AddMemberForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (input: {
    fullName: string;
    email: string;
    phone: string;
    birthday: string;
    role: MemberRole;
    status: MemberStatus;
  }) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [status, setStatus] = useState<MemberStatus>("approved");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.trim()) return;
    startTransition(async () => {
      await onSubmit({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        birthday,
        role,
        status,
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rsd-card"
      style={{ flexDirection: "column", gap: 14, padding: "16px 18px" }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>Add member</div>

      <Input
        label="Full name *"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="e.g. Beth Malone"
        autoFocus
        required
        disabled={pending}
      />

      <Input
        label="Email (leave blank for a directory-only entry)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="person@example.com"
        disabled={pending}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input
          label="Phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(402) 555-0100"
          disabled={pending}
        />
        <Input
          label="Birthday"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          disabled={pending}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          disabled={pending}
        >
          <option value="member">Member</option>
          <option value="admin">Board</option>
          <option value="super_admin">Super-admin</option>
        </Select>
        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as MemberStatus)}
          disabled={pending}
        >
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="denied">Denied</option>
        </Select>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !fullName.trim()}>
          {pending ? "Creating…" : "Create member"}
        </Pill>
      </div>
    </form>
  );
}
