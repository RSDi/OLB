"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import type { MemberRole, MemberStatus } from "../../../lib/auth/permissions";
import {
  createMember,
  addMemberRelationship,
  removeMemberRelationship,
  type RelationshipKind,
} from "../../../lib/auth/member-actions";

interface Member {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
  status: MemberStatus;
  role: MemberRole;
  requested_at: string;
  reviewed_at: string | null;
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

export function MembersTab({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MemberStatus>("pending");
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [
      { data: m, error: mErr },
      { data: r, error: rErr },
    ] = await Promise.all([
      supabase
        .from("members")
        .select(
          "id, user_id, email, full_name, avatar_url, phone, birthday, status, role, requested_at, reviewed_at"
        )
        .order("requested_at", { ascending: false }),
      supabase
        .from("member_relationships")
        .select("id, member_id, related_member_id, relationship"),
    ]);
    if (mErr || rErr) setError(mErr?.message ?? rErr?.message ?? "Failed to load");
    else {
      setMembers((m as Member[]) ?? []);
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
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("members")
      .update({
        status,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  async function setRole(id: string, role: MemberRole) {
    setActing(id);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("members")
      .update({
        role,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) setError(updateError.message);
    else await load();
    setActing(null);
  }

  async function removeMember(id: string) {
    if (!confirm("Permanently remove this member? This cannot be undone.")) return;
    setActing(id);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("members").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    else await load();
    setActing(null);
  }

  async function saveMemberDetails(
    id: string,
    fields: {
      full_name: string | null;
      avatar_url: string | null;
      phone: string | null;
      birthday: string | null;
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

  const byStatus = (s: MemberStatus) => members.filter((m) => m.status === s);
  const counts = {
    pending: byStatus("pending").length,
    approved: byStatus("approved").length,
    denied: byStatus("denied").length,
  };

  const tabs: { key: MemberStatus; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "denied", label: "Denied" },
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
          Pre-create a member to seed a sign-in (they&apos;ll set their password via{" "}
          <code style={{ fontFamily: "inherit" }}>/register</code> using the email you enter), or
          add them with no email as a directory entry for family relationships.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add member
          </Pill>
        )}
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

      {/* Status sub-tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
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
                  background: t.key === "pending" ? "var(--gw-error)" : "var(--gw-bg)",
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
      ) : byStatus(tab).length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {tab === "pending"
              ? "No pending requests"
              : tab === "approved"
              ? "No approved members yet"
              : "No denied requests"}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {byStatus(tab).map((member) =>
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
              />
            ) : (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.user_id === currentUserId}
                tab={tab}
                acting={acting === member.id}
                onApprove={() => setStatus(member.id, "approved")}
                onDeny={() => setStatus(member.id, "denied")}
                onRestore={() => setStatus(member.id, "pending")}
                onRemove={() => removeMember(member.id)}
                onPromote={() => setRole(member.id, "admin")}
                onDemote={() => setRole(member.id, "member")}
                onEdit={() => setEditingId(member.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  tab,
  acting,
  onApprove,
  onDeny,
  onRestore,
  onRemove,
  onPromote,
  onDemote,
  onEdit,
}: {
  member: Member;
  isSelf: boolean;
  tab: MemberStatus;
  acting: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onPromote: () => void;
  onDemote: () => void;
  onEdit: () => void;
}) {
  return (
    <div
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
        {member.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.avatar_url} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
        ) : (
          <Icons.Users width={18} height={18} style={{ color: "var(--gw-fg-muted)" }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, lineHeight: 1.2, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
            {member.full_name ?? "Unknown"}
          </span>
          {member.role === "super_admin" && (
            <span className="rsd-chip rsd-chip-accent">Super-admin</span>
          )}
          {member.role === "admin" && <span className="rsd-chip rsd-chip-mute">Admin</span>}
          {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
          {!member.email && <span className="rsd-chip rsd-chip-mute">Directory only</span>}
          {member.email && !member.user_id && (
            <span className="rsd-chip rsd-chip-warn">Invited</span>
          )}
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
        <ActionBtn onClick={onEdit} disabled={acting} color="var(--gw-fg)" bgColor="var(--gw-bg-elev)">
          Edit
        </ActionBtn>
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
        {tab === "approved" && (
          <>
            {!isSelf && member.role === "member" && (
              <ActionBtn
                onClick={onPromote}
                disabled={acting}
                color="var(--rsd-accent)"
                bgColor="var(--rsd-accent-bg)"
              >
                Promote to admin
              </ActionBtn>
            )}
            {!isSelf && member.role === "admin" && (
              <ActionBtn
                onClick={onDemote}
                disabled={acting}
                color="var(--gw-fg-muted)"
                bgColor="var(--gw-bg-elev)"
              >
                Demote to member
              </ActionBtn>
            )}
            {!isSelf && member.role !== "super_admin" && (
              <ActionBtn
                onClick={onRemove}
                disabled={acting}
                color="var(--gw-error)"
                bgColor="var(--gw-error-bg)"
              >
                Revoke
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
            <ActionBtn onClick={onRemove} disabled={acting} color="var(--gw-error)" bgColor="var(--gw-error-bg)">
              Remove
            </ActionBtn>
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

function MemberEditForm({
  member,
  allMembers,
  relationships,
  pending,
  onCancel,
  onSave,
  onAddRelationship,
  onRemoveRelationship,
}: {
  member: Member;
  allMembers: Member[];
  relationships: Relationship[];
  pending: boolean;
  onCancel: () => void;
  onSave: (fields: {
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    birthday: string | null;
  }) => void | Promise<void>;
  onAddRelationship: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
  onRemoveRelationship: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthday, setBirthday] = useState(member.birthday ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onSave({
      full_name: fullName.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      phone: phone.trim() || null,
      birthday: birthday || null,
    });
  }

  // Find this member's existing relationships by kind.
  const myLinks = relationships.filter((r) => r.member_id === member.id);
  const spouse = myLinks.find((r) => r.relationship === "spouse");
  const parents = myLinks.filter((r) => r.relationship === "parent");
  const children = myLinks.filter((r) => r.relationship === "child");
  const memberById = new Map(allMembers.map((m) => [m.id, m]));

  return (
    <form
      onSubmit={handleSubmit}
      className="rsd-card"
      style={{
        flexDirection: "column",
        gap: 12,
        padding: "14px 18px",
        opacity: pending ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" width={40} height={40} style={{ objectFit: "cover" }} />
          ) : (
            <Icons.Users width={18} height={18} style={{ color: "var(--gw-fg-muted)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
            {member.email}
          </div>
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
            Email is read-only — it's tied to the sign-in account.
          </div>
        </div>
      </div>

      <Input
        label="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="e.g. Jeff Malone"
        autoFocus
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
      <Input
        label="Avatar URL (optional)"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="https://…"
        disabled={pending}
      />

      <FamilySection
        memberId={member.id}
        allMembers={allMembers}
        memberById={memberById}
        spouse={spouse}
        parents={parents}
        children={children}
        pending={pending}
        onAdd={onAddRelationship}
        onRemove={onRemoveRelationship}
      />

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Pill>
      </div>
    </form>
  );
}

function FamilySection({
  memberId,
  allMembers,
  memberById,
  spouse,
  parents,
  children,
  pending,
  onAdd,
  onRemove,
}: {
  memberId: string;
  allMembers: Member[];
  memberById: Map<string, Member>;
  spouse: Relationship | undefined;
  parents: Relationship[];
  children: Relationship[];
  pending: boolean;
  onAdd: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
  onRemove: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
}) {
  // Members eligible to be linked (everyone except self).
  const candidates = allMembers
    .filter((m) => m.id !== memberId)
    .sort((a, b) => (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? ""));

  const parentIds = new Set(parents.map((p) => p.related_member_id));
  const childIds = new Set(children.map((c) => c.related_member_id));

  return (
    <fieldset
      style={{
        border: "1px solid var(--gw-border)",
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <legend
        style={{
          padding: "0 8px",
          fontSize: 12,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        Family
      </legend>

      <RelationshipRow
        label="Spouse"
        max={1}
        existing={spouse ? [spouse] : []}
        candidates={candidates.filter((c) => !spouse || c.id === spouse.related_member_id)}
        memberById={memberById}
        pending={pending}
        onPick={(id) => onAdd(id, "spouse")}
        onRemove={(id) => onRemove(id, "spouse")}
      />

      <RelationshipRow
        label="Parents"
        existing={parents}
        candidates={candidates.filter((c) => !parentIds.has(c.id))}
        memberById={memberById}
        pending={pending}
        onPick={(id) => onAdd(id, "parent")}
        onRemove={(id) => onRemove(id, "parent")}
      />

      <RelationshipRow
        label="Children"
        existing={children}
        candidates={candidates.filter((c) => !childIds.has(c.id))}
        memberById={memberById}
        pending={pending}
        onPick={(id) => onAdd(id, "child")}
        onRemove={(id) => onRemove(id, "child")}
      />
    </fieldset>
  );
}

function RelationshipRow({
  label,
  max,
  existing,
  candidates,
  memberById,
  pending,
  onPick,
  onRemove,
}: {
  label: string;
  max?: number;
  existing: Relationship[];
  candidates: Member[];
  memberById: Map<string, Member>;
  pending: boolean;
  onPick: (relatedId: string) => void | Promise<void>;
  onRemove: (relatedId: string) => void | Promise<void>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const atMax = typeof max === "number" && existing.length >= max;

  function handlePick() {
    if (!picked) return;
    onPick(picked);
    setPicked("");
    setPickerOpen(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {existing.length === 0 && !pickerOpen && (
          <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, fontStyle: "italic" }}>
            None
          </span>
        )}
        {existing.map((r) => {
          const m = memberById.get(r.related_member_id);
          const display = m ? m.full_name ?? m.email ?? "Unknown" : "(deleted member)";
          return (
            <span
              key={r.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 4px 4px 10px",
                borderRadius: 100,
                background: "var(--rsd-accent-bg)",
                color: "var(--rsd-accent)",
                border: "1px solid rgba(108,140,89,.25)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {display}
              <button
                type="button"
                onClick={() => onRemove(r.related_member_id)}
                disabled={pending}
                title="Remove"
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  borderRadius: "50%",
                  background: "transparent",
                  color: "inherit",
                  border: "none",
                  cursor: pending ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.7,
                }}
              >
                <Icons.X width={10} height={10} />
              </button>
            </span>
          );
        })}

        {pickerOpen ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, minWidth: 200 }}>
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              disabled={pending}
              style={{
                flex: 1,
                height: 32,
                padding: "0 28px 0 10px",
                borderRadius: 8,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
                color: "var(--gw-fg)",
                fontSize: 12,
                fontWeight: 600,
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              <option value="">— Pick a member —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.email ?? "Unknown"}
                </option>
              ))}
            </select>
            <Pill variant="accent" size="sm" onClick={handlePick} disabled={pending || !picked}>
              Add
            </Pill>
            <Pill
              variant="ghost"
              size="sm"
              onClick={() => {
                setPickerOpen(false);
                setPicked("");
              }}
              disabled={pending}
            >
              Cancel
            </Pill>
          </div>
        ) : (
          !atMax && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={pending || candidates.length === 0}
              style={{
                padding: "4px 10px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg-muted)",
                border: "1px dashed var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                cursor: pending || candidates.length === 0 ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              title={candidates.length === 0 ? "No other members to link" : "Add"}
            >
              <Icons.Plus width={10} height={10} /> Add
            </button>
          )
        )}
      </div>
    </div>
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
          <option value="admin">Admin</option>
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
