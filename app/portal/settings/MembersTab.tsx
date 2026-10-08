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
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  permissionsForBase,
  profileOf,
  sortProfiles,
  type AccessProfile,
  type PermissionDef,
  type PermissionKey,
} from "../../../lib/auth/access";

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
  // Website grant (0120), loaded the same way.
  can_manage_website: boolean;
  // Access profile and extras (0122); null and [] before the migration.
  access_profile_id: string | null;
  extra_permissions: string[];
  membership_status: string;
  access_revoked_at: string | null;
  requested_at: string;
  reviewed_at: string | null;
}

// Before migration 0122 these permissions are offered only once their own
// grant column (0110, 0118, 0120) loads.
const NEEDS: Partial<Record<PermissionKey, "travel" | "slack" | "website">> = {
  travel: "travel",
  slack_dm: "slack",
  website: "website",
};

// A person's access as this page shows it.
interface MemberAccess {
  // Their access profile. Null for super-admins, and before 0122.
  profile: AccessProfile | null;
  // The permissions that can apply to them: Settings ones only on Board.
  // Empty for super-admins, who hold everything.
  offered: PermissionDef[];
  // Where a permission comes from: their profile, an extra given just to
  // them, or neither.
  source: (p: PermissionDef) => "profile" | "extra" | null;
}

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
  // The Website grant needs migration 0120, the same way.
  const [websiteReady, setWebsiteReady] = useState(false);
  // Access profiles (0122). Null before the migration: the page then reads
  // and writes the old per-grant columns, and picks a role instead.
  const [profiles, setProfiles] = useState<AccessProfile[] | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // Approved tab only: one card per person, or every person's role and
  // access side by side in a table.
  const [view, setView] = useState<"list" | "table">("list");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [
      { data: m, error: mErr },
      { data: r, error: rErr },
      { data: t, error: tErr },
      { data: sd, error: sdErr },
      { data: w, error: wErr },
      { data: ap, error: apErr },
      { data: pm, error: pmErr },
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
      // The Website grant (0120), the same way.
      supabase.from("members").select("id, can_manage_website").is("deleted_at", null),
      // Access profiles and each person's profile and extras (0122), the same way.
      supabase.from("access_profiles").select("id, name, base_role, permissions, is_builtin"),
      supabase.from("members").select("id, access_profile_id, extra_permissions").is("deleted_at", null),
    ]);
    if (mErr || rErr) setError(mErr?.message ?? rErr?.message ?? "Failed to load");
    else {
      const travel = new Map(((t as { id: string; can_manage_travel: boolean }[] | null) ?? []).map((x) => [x.id, !!x.can_manage_travel]));
      const slack = new Map(((sd as { id: string; can_slack_dm: boolean }[] | null) ?? []).map((x) => [x.id, !!x.can_slack_dm]));
      setTravelReady(!tErr);
      const website = new Map(((w as { id: string; can_manage_website: boolean }[] | null) ?? []).map((x) => [x.id, !!x.can_manage_website]));
      setSlackReady(!sdErr);
      setWebsiteReady(!wErr);
      const profilesReady = !apErr && !pmErr;
      setProfiles(profilesReady ? sortProfiles((ap as AccessProfile[]) ?? []) : null);
      type ProfileRow = { id: string; access_profile_id: string | null; extra_permissions: string[] | null };
      const onProfile = new Map(((profilesReady ? pm : null) as ProfileRow[] | null ?? []).map((x) => [x.id, x]));
      setMembers(
        ((m as Omit<Member, "can_manage_travel" | "can_slack_dm" | "can_manage_website" | "access_profile_id" | "extra_permissions">[]) ?? []).map((x) => ({
          ...x,
          can_manage_travel: travel.get(x.id) ?? false,
          can_slack_dm: slack.get(x.id) ?? false,
          can_manage_website: website.get(x.id) ?? false,
          access_profile_id: onProfile.get(x.id)?.access_profile_id ?? null,
          extra_permissions: onProfile.get(x.id)?.extra_permissions ?? [],
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

  // Write fields on a member row. RLS lets only super-admins change roles,
  // profiles and grants (same path as setRole), so these are super-admin only.
  async function updateMember(id: string, fields: Record<string, unknown>) {
    setActing(id);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("members").update(fields).eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  // Give or take one permission from one person: an extra on top of their
  // profile, or before 0122 the permission's own column.
  function setPermission(member: Member, p: PermissionDef, on: boolean) {
    if (!profiles) return p.legacyColumn ? updateMember(member.id, { [p.legacyColumn]: on }) : undefined;
    const extras = on
      ? [...new Set([...member.extra_permissions, p.key])]
      : member.extra_permissions.filter((k) => k !== p.key);
    return updateMember(member.id, { extra_permissions: extras });
  }

  // Put someone on a profile, or make them a super-admin. Their extras come
  // off: the profile's permissions replace whatever they had.
  async function chooseProfile(member: Member, value: string) {
    if (!profiles) return;
    const current = member.role === "super_admin" ? "super_admin" : profileOf(member, profiles)?.id;
    if (value === current) return;
    const name = memberDisplayName(member);
    const extras = PERMISSIONS.filter((p) => member.extra_permissions.includes(p.key)).map((p) => p.label);
    if (value === "super_admin") {
      if (!confirm(`Make ${name} a Super-admin? They'll have full control — managing members, roles, and every setting.`))
        return;
      return updateMember(member.id, {
        role: "super_admin",
        access_profile_id: null,
        extra_permissions: [],
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      });
    }
    const profile = profiles.find((p) => p.id === value);
    if (!profile) return;
    if (member.role === "super_admin") {
      if (!confirm(`Remove Super-admin from ${name} and put them on ${profile.name}?`)) return;
    } else if (extras.length > 0) {
      if (!confirm(`Put ${name} on ${profile.name}? Their extras (${extras.join(", ")}) come off.`)) return;
    }
    return updateMember(member.id, {
      role: profile.base_role,
      access_profile_id: profile.id,
      extra_permissions: [],
      reviewed_by: currentUserId,
      reviewed_at: new Date().toISOString(),
    });
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
    accessProfileId: string | null;
  }) {
    setError(null);
    const result = await createMember({
      fullName: input.fullName,
      email: input.email || null,
      phone: input.phone || null,
      birthday: input.birthday || null,
      role: input.role,
      status: input.status,
      accessProfileId: input.accessProfileId,
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

  const ready = { travel: travelReady, slack: slackReady, website: websiteReady };
  // Before 0122 only the permissions with their own column exist.
  const isOffered = (p: PermissionDef) =>
    !!profiles || (!!p.legacyColumn && (!NEEDS[p.key] || ready[NEEDS[p.key]!]));

  function accessOf(m: Member): MemberAccess {
    if (m.role === "super_admin") return { profile: null, offered: [], source: () => null };
    const offered = permissionsForBase(m.role).filter(isOffered);
    if (!profiles)
      return { profile: null, offered, source: (p) => (p.legacyColumn && m[p.legacyColumn] ? "extra" : null) };
    const profile = profileOf(m, profiles);
    const fromProfile = new Set(profile?.permissions ?? []);
    const extras = new Set(m.extra_permissions);
    return {
      profile,
      offered,
      source: (p) => (fromProfile.has(p.key) ? "profile" : extras.has(p.key) ? "extra" : null),
    };
  }

  // The profile picker, or the role picker before 0122.
  const picker = (m: Member) =>
    profiles ? (
      <PickerSelect
        label="Access profile"
        value={m.role === "super_admin" ? "super_admin" : profileOf(m, profiles)?.id ?? ""}
        options={[
          ...profiles.map((p) => ({ value: p.id, label: p.name })),
          { value: "super_admin", label: "Super-admin" },
        ]}
        disabled={acting === m.id}
        onChange={(v) => chooseProfile(m, v)}
      />
    ) : (
      <PickerSelect
        label="Permission group"
        value={m.role}
        options={[
          { value: "member", label: "Member" },
          { value: "admin", label: "Board" },
          { value: "super_admin", label: "Super-admin" },
        ]}
        disabled={acting === m.id}
        onChange={(v) => changeRole(m, v as MemberRole)}
      />
    );

  const showTable = tab === "approved" && canManage && view === "table";

  const tabs: { key: TabKey; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
    { key: "invited", label: "Not signed up" },
  ];

  return (
    <div style={{ maxWidth: showTable ? 1100 : 760 }}>
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
            // Starts over on Member once the profiles arrive.
            key={profiles ? "profiles" : "roles"}
            profiles={profiles}
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div data-tour="members-status" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              data-tour={t.key === "approved" ? "members-tab-approved" : undefined}
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
        {tab === "approved" && canManage && <ViewToggle view={view} onChange={setView} />}
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
      ) : showTable ? (
        <AccessTable
          members={visibleInTab}
          totalCount={byStatus(tab).length}
          filtered={!!q}
          currentUserId={currentUserId}
          actingId={acting}
          columns={PERMISSIONS.filter(isOffered)}
          pickerLabel={profiles ? "Profile" : "Role"}
          accessOf={accessOf}
          picker={picker}
          onSetPermission={setPermission}
        />
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
                access={accessOf(member)}
                profilesOn={!!profiles}
                picker={picker(member)}
                onApprove={() => setStatus(member.id, "approved")}
                onDeny={() => setStatus(member.id, "denied")}
                onRestore={() => setStatus(member.id, "pending")}
                onRemove={() => removeMember(member.id)}
                onSetPermission={(p, on) => setPermission(member, p, on)}
                onEdit={() => setEditingId(member.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

// List / Roles & access switch on the Approved tab.
function ViewToggle({ view, onChange }: { view: "list" | "table"; onChange: (v: "list" | "table") => void }) {
  const opt = (v: "list" | "table", label: string) => (
    <button
      onClick={() => onChange(v)}
      aria-pressed={view === v}
      style={{
        padding: "5px 12px",
        borderRadius: 7,
        border: "none",
        background: view === v ? "var(--gw-bg-elev)" : "transparent",
        boxShadow: view === v ? "0 0 0 1px var(--gw-border)" : "none",
        color: view === v ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      data-tour="members-view"
      role="group"
      aria-label="View"
      style={{
        marginLeft: "auto",
        display: "inline-flex",
        gap: 2,
        padding: 2,
        borderRadius: 9,
        background: "var(--gw-bg)",
        border: "1px solid var(--gw-border)",
      }}
    >
      {opt("list", "List")}
      {opt("table", "Roles & access")}
    </div>
  );
}

// Every approved person's profile and permissions on one grid, so a
// super-admin can see at a glance who holds what and change it in place.
// Super-admins hold everything already; Settings permissions only apply to
// Board. A permission from someone's profile shows ticked but greyed: change
// it on the profile, in Settings → Access Profiles.
function AccessTable({
  members,
  totalCount,
  filtered,
  currentUserId,
  actingId,
  columns,
  pickerLabel,
  accessOf,
  picker,
  onSetPermission,
}: {
  members: Member[];
  totalCount: number;
  filtered: boolean;
  currentUserId: string;
  actingId: string | null;
  columns: PermissionDef[];
  pickerLabel: string;
  accessOf: (m: Member) => MemberAccess;
  picker: (m: Member) => React.ReactNode;
  onSetPermission: (member: Member, p: PermissionDef, on: boolean) => void;
}) {
  const access = new Map(members.map((m) => [m.id, accessOf(m)]));
  const holds = (m: Member, p: PermissionDef) =>
    m.role === "super_admin" || (p.group === "board" && m.role === "admin") || !!access.get(m.id)!.source(p);
  const groups = PERMISSION_GROUPS.map((g) => ({ ...g, defs: columns.filter((p) => p.group === g.key) })).filter(
    (g) => g.defs.length > 0
  );
  const groupTh: React.CSSProperties = {
    textAlign: "center",
    borderLeft: "1px solid var(--gw-border)",
    paddingBottom: 4,
  };
  const colTh = (first: boolean): React.CSSProperties => ({
    textAlign: "center",
    whiteSpace: "nowrap",
    borderLeft: first ? "1px solid var(--gw-border)" : undefined,
  });
  const stickyName: React.CSSProperties = {
    position: "sticky",
    left: 0,
    zIndex: 1,
    background: "var(--gw-bg-elev)",
  };
  const cell = (m: Member, p: PermissionDef, first: boolean) => {
    const style: React.CSSProperties = {
      textAlign: "center",
      borderLeft: first ? "1px solid var(--gw-border)" : undefined,
    };
    if (m.role === "super_admin")
      return (
        <td key={p.key} style={{ ...style, color: "var(--gw-fg-muted)" }} title="Super-admins have everything">
          ✓
        </td>
      );
    const a = access.get(m.id)!;
    // Board has every Board power already.
    if (p.group === "board" && m.role === "admin")
      return (
        <td key={p.key} style={{ ...style, color: "var(--gw-fg-muted)" }} title="Board has this">
          ✓
        </td>
      );
    if (!a.offered.includes(p))
      return (
        <td key={p.key} style={{ ...style, color: "var(--gw-fg-muted)" }} title="Board members only">
          –
        </td>
      );
    const source = a.source(p);
    return (
      <td key={p.key} style={style}>
        <input
          type="checkbox"
          checked={!!source}
          disabled={actingId === m.id || source === "profile"}
          onChange={(e) => onSetPermission(m, p, e.target.checked)}
          aria-label={`${memberDisplayName(m)}: ${p.group === "settings" ? "Settings " : ""}${p.label}`}
          title={source === "profile" ? `From the ${a.profile?.name} profile` : p.desc}
          style={{
            width: 16,
            height: 16,
            cursor: source === "profile" ? "default" : "pointer",
            accentColor: "var(--rsd-accent-fill)",
          }}
        />
      </td>
    );
  };
  return (
    <div data-tour="members-table">
      {filtered && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, marginBottom: 8 }}>
          {members.length} of {totalCount} match
        </div>
      )}
      <div className="rsd-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="rsd-tbl" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th style={{ ...stickyName, borderBottom: 0 }} />
              <th style={{ borderBottom: 0 }} />
              {groups.map((g) => (
                <th key={g.key} colSpan={g.defs.length} style={groupTh}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              <th style={stickyName}>Name</th>
              <th>{pickerLabel}</th>
              {groups.flatMap((g) =>
                g.defs.map((p, i) => (
                  <th key={p.key} style={colTh(i === 0)} title={p.desc}>
                    {p.label}
                    <div style={{ fontWeight: 600, letterSpacing: 0, textTransform: "none" }}>
                      {members.filter((m) => holds(m, p)).length}
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.user_id === currentUserId;
              const a = access.get(m.id)!;
              const extras = a.offered.filter((p) => a.source(p) === "extra").length;
              return (
                <tr key={m.id} style={{ opacity: actingId === m.id ? 0.5 : 1 }}>
                  <td style={{ ...stickyName, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {memberDisplayName(m)}
                    {isSelf && (
                      <span className="rsd-chip rsd-chip-mute" style={{ marginLeft: 6 }}>
                        You
                      </span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {isSelf ? (
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{a.profile?.name ?? ROLE_LABEL[m.role]}</span>
                    ) : (
                      picker(m)
                    )}
                    {a.profile && extras > 0 && (
                      <span
                        className="rsd-chip rsd-chip-mute"
                        style={{ marginLeft: 6 }}
                        title="Has permissions on top of their profile"
                      >
                        + extras
                      </span>
                    )}
                  </td>
                  {groups.flatMap((g) => g.defs.map((p, i) => cell(m, p, i === 0)))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROLE_LABEL: Record<MemberRole, string> = {
  member: "Member",
  admin: "Board",
  super_admin: "Super-admin",
};

// Compact picker for a member's row: their access profile, or before
// migration 0122 their permission group. Super-admin only (the row only
// renders it when canManage).
function PickerSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <ComboSelect
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      title={label}
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
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </ComboSelect>
  );
}

function MemberRow({
  member,
  isSelf,
  tab,
  acting,
  canManage,
  access,
  profilesOn,
  picker,
  onApprove,
  onDeny,
  onRestore,
  onRemove,
  onSetPermission,
  onEdit,
}: {
  member: Member;
  isSelf: boolean;
  tab: MemberStatus;
  acting: boolean;
  canManage: boolean;
  access: MemberAccess;
  profilesOn: boolean;
  picker: React.ReactNode;
  onApprove: () => void;
  onDeny: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onSetPermission: (p: PermissionDef, on: boolean) => void;
  onEdit: () => void;
}) {
  const rowAvatar = resolveAvatarUrl(member);
  const [accessOpen, setAccessOpen] = useState(false);
  const showAccess = tab === "approved" && canManage && member.role !== "super_admin";
  const granted = showAccess
    ? access.offered
        .filter((p) => access.source(p))
        .map((p) => (p.group === "settings" ? `Settings: ${p.label}` : p.label))
    : [];
  const extras = access.offered.filter((p) => access.source(p) === "extra").length;
  // A profile of the club's own (Treasurer, Registrar…) gets a chip; the
  // built-in Member and Board read from the role chip already.
  const customProfile = access.profile && !access.profile.is_builtin ? access.profile.name : null;
  return (
    <div
      data-tour="members-row"
      className="rsd-card"
      style={{
        gap: 0,
        padding: "14px 18px",
        opacity: acting ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Wraps on a phone: the buttons drop below the name. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
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
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
              {memberDisplayName(member)}
            </span>
            {member.role === "super_admin" && (
              <span className="rsd-chip rsd-chip-accent">Super-admin</span>
            )}
            {member.role === "admin" && <span className="rsd-chip rsd-chip-mute">Board</span>}
            {canManage && customProfile && (
              <span className="rsd-chip rsd-chip-mute" title="Their access profile">
                {customProfile}
              </span>
            )}
            {canManage && profilesOn && extras > 0 && (
              <span className="rsd-chip rsd-chip-mute" title="Has permissions on top of their profile">
                + extras
              </span>
            )}
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
          {showAccess && granted.length > 0 && !accessOpen && (
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>Access:</span> {granted.join(", ")}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginLeft: "auto", maxWidth: "100%" }}>
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
              {!isSelf && picker}
              {member.role !== "super_admin" && (
                <AccessButton count={granted.length} open={accessOpen} onClick={() => setAccessOpen((o) => !o)} />
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
      {showAccess && accessOpen && (
        <AccessPanel access={access} profilesOn={profilesOn} extras={extras} disabled={acting} onSetPermission={onSetPermission} />
      )}
    </div>
  );
}

// Opens a member's Access panel; shows how many grants they hold.
function AccessButton({ count, open, onClick }: { count: number; open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      title="What this person can manage"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        borderRadius: 8,
        background: open ? "var(--gw-bg)" : "var(--gw-bg-elev)",
        color: "var(--gw-fg)",
        border: "1px solid var(--gw-border)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      Access
      {count > 0 && (
        <span
          style={{
            minWidth: 18,
            padding: "1px 6px",
            borderRadius: 100,
            background: "var(--rsd-accent-fill)",
            color: "var(--rsd-accent-fill-on)",
            fontSize: 11,
            lineHeight: "16px",
            textAlign: "center",
          }}
        >
          {count}
        </span>
      )}
      <span aria-hidden style={{ fontSize: 10, color: "var(--gw-fg-muted)" }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}

// The permissions a super-admin can hand out, as labelled switches with what
// each one does, grouped so the list can keep growing without crowding the
// row. Those from the person's profile show ticked and greyed: they change on
// the profile, in Settings → Access Profiles. The rest are extras, just for
// this person.
function AccessPanel({
  access,
  profilesOn,
  extras,
  disabled,
  onSetPermission,
}: {
  access: MemberAccess;
  profilesOn: boolean;
  extras: number;
  disabled: boolean;
  onSetPermission: (p: PermissionDef, on: boolean) => void;
}) {
  return (
    <div
      data-tour="members-access"
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--gw-border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {profilesOn && access.profile && (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
          On the <strong style={{ color: "var(--gw-fg)" }}>{access.profile.name}</strong> profile
          {extras > 0 ? `, plus ${extras === 1 ? "1 extra" : `${extras} extras`}` : ""}. Greyed ticks come from the
          profile (change them in Settings → Access Profiles); tick anything else to give it to just this person.
        </div>
      )}
      {PERMISSION_GROUPS.map((g) => {
        const defs = access.offered.filter((p) => p.group === g.key);
        if (defs.length === 0) return null;
        return (
          <div key={g.key}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--gw-fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".04em",
                marginBottom: 6,
              }}
            >
              {g.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>
              {defs.map((p) => (
                <GrantToggle
                  key={p.key}
                  def={p}
                  source={access.source(p)}
                  profileName={access.profile?.name}
                  disabled={disabled}
                  onChange={(v) => onSetPermission(p, v)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GrantToggle({
  def,
  source,
  profileName,
  disabled,
  onChange,
}: {
  def: PermissionDef;
  source: "profile" | "extra" | null;
  profileName?: string;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  const on = !!source;
  const locked = source === "profile";
  return (
    <label
      title={locked ? `From the ${profileName} profile` : undefined}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${on ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
        background: "var(--gw-bg)",
        opacity: locked ? 0.75 : 1,
        cursor: disabled || locked ? "default" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled || locked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: "var(--rsd-accent-fill)" }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg)" }}>
          {def.label}
          {locked && (
            <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)", fontSize: 11 }}> · from {profileName}</span>
          )}
        </span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--gw-fg-muted)", lineHeight: 1.35 }}>{def.desc}</span>
      </span>
    </label>
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

function AddMemberForm({
  profiles,
  onCancel,
  onSubmit,
}: {
  // Access profiles (0122) to start them on; null before the migration, when
  // the form asks for a role instead.
  profiles: AccessProfile[] | null;
  onCancel: () => void;
  onSubmit: (input: {
    fullName: string;
    email: string;
    phone: string;
    birthday: string;
    role: MemberRole;
    status: MemberStatus;
    accessProfileId: string | null;
  }) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  // A profile id, or "super_admin"; before 0122 a role. Starts on Member.
  const memberProfile = profiles?.find((p) => p.is_builtin && p.base_role === "member");
  const [access, setAccess] = useState<string>(memberProfile?.id ?? "member");
  const [status, setStatus] = useState<MemberStatus>("approved");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.trim()) return;
    const profile = profiles?.find((p) => p.id === access) ?? null;
    if (access === "super_admin" && !confirm(`Make ${fullName.trim()} a Super-admin? They'll have full control — managing members, roles, and every setting.`))
      return;
    startTransition(async () => {
      await onSubmit({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        birthday,
        role: profile ? profile.base_role : (access as MemberRole),
        status,
        accessProfileId: profile?.id ?? null,
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
        {profiles ? (
          <Select
            label="Access profile"
            help="What they can do: Member, Board, a profile from Settings → Access Profiles, or Super-admin."
            value={access}
            onChange={(e) => setAccess(e.target.value)}
            disabled={pending}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="super_admin">Super-admin</option>
          </Select>
        ) : (
          <Select label="Role" value={access} onChange={(e) => setAccess(e.target.value)} disabled={pending}>
            <option value="member">Member</option>
            <option value="admin">Board</option>
            <option value="super_admin">Super-admin</option>
          </Select>
        )}
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
