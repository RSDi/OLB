"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Pill, Textarea } from "../../../components/ui";
import { resolveAvatarUrl } from "../../../../lib/members/avatar";
import {
  updateOwnProfile,
  addMemberRelationship,
  removeMemberRelationship,
  softDeleteMember,
  updateMemberNotes,
  type RelationshipKind,
} from "../../../../lib/auth/member-actions";
import { createClient } from "../../../../lib/supabase/client";
import {
  MemberEditForm,
  type EditFormMember,
  type EditFormRelationship,
} from "../../settings/MemberEditForm";

interface DetailMember {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  home_phone: string | null;
  birthday: string | null;
  anniversary: string | null;
  address: string | null;
  directory_category: "regular" | "extended" | "memorial";
  deceased_at: string | null;
  status: string;
}

interface Related {
  relatedId: string;
  relatedName: string;
  relationship: "spouse" | "parent" | "child";
}

function formatMonthDay(iso: string | null): string | null {
  if (!iso) return null;
  // Show month + day only — common church-directory convention.
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  const date = new Date(2000, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function formatFullDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function MemberDetail({
  member,
  relationships,
  players,
  allMembers,
  allRelationships,
  isSelf,
  isSuperAdmin,
  isStaff,
  notes,
}: {
  member: DetailMember;
  relationships: Related[];
  players: { id: string; name: string; team: string | null }[];
  allMembers: EditFormMember[];
  allRelationships: EditFormRelationship[];
  isSelf: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  notes: string;
}) {
  const [editing, setEditing] = useState(false);
  const [adminEditing, setAdminEditing] = useState(false);
  const [adminPending, setAdminPending] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAdminSave(fields: {
    full_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
    phone: string | null;
    birthday: string | null;
  }) {
    setAdminPending(true);
    setAdminError(null);
    const supabase = createClient();
    const { error } = await supabase.from("members").update(fields).eq("id", member.id);
    if (error) {
      setAdminError(error.message);
      setAdminPending(false);
      return;
    }
    setAdminEditing(false);
    setAdminPending(false);
    router.refresh();
  }

  async function handleAdminAddRel(relatedId: string, kind: RelationshipKind) {
    setAdminPending(true);
    setAdminError(null);
    const res = await addMemberRelationship(member.id, relatedId, kind);
    if (res.error) setAdminError(res.error);
    setAdminPending(false);
    router.refresh();
  }

  async function handleAdminRemoveRel(relatedId: string, kind: RelationshipKind) {
    setAdminPending(true);
    setAdminError(null);
    const res = await removeMemberRelationship(member.id, relatedId, kind);
    if (res.error) setAdminError(res.error);
    setAdminPending(false);
    router.refresh();
  }

  async function handleAdminDelete() {
    setAdminPending(true);
    setAdminError(null);
    const res = await softDeleteMember(member.id);
    if (res.error) {
      setAdminError(res.error);
      setAdminPending(false);
      return;
    }
    router.push("/portal/directory");
  }
  const name = member.full_name ?? member.email ?? "Unknown";
  const birthdayLabel = formatMonthDay(member.birthday);
  const anniversaryLabel = formatMonthDay(member.anniversary);
  const deceasedLabel = formatFullDate(member.deceased_at);

  const spouse = relationships.find((r) => r.relationship === "spouse");
  const parents = relationships.filter((r) => r.relationship === "parent");
  const children = relationships.filter((r) => r.relationship === "child");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/portal/directory"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to directory
        </Link>
        {isSuperAdmin && !adminEditing && (
          <button
            type="button"
            onClick={() => setAdminEditing(true)}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--gw-fg-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icons.Pencil width={12} height={12} />
            Edit
          </button>
        )}
      </div>

      {adminEditing ? (
        <>
          {adminError && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--gw-error-bg)",
                border: "1px solid rgba(229,62,62,.25)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 12,
                color: "var(--gw-error)",
                fontWeight: 600,
              }}
            >
              <Icons.AlertCircle width={14} height={14} />
              {adminError}
            </div>
          )}
          <MemberEditForm
            member={member}
            allMembers={allMembers}
            relationships={allRelationships}
            pending={adminPending}
            onCancel={() => {
              setAdminEditing(false);
              setAdminError(null);
            }}
            onSave={handleAdminSave}
            onAddRelationship={handleAdminAddRel}
            onRemoveRelationship={handleAdminRemoveRel}
            onDelete={isSelf ? undefined : handleAdminDelete}
          />
        </>
      ) : editing && isSelf ? (
        <EditForm
          member={member}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <>
          <ProfileCard
            member={member}
            name={name}
            birthdayLabel={birthdayLabel}
            anniversaryLabel={anniversaryLabel}
            deceasedLabel={deceasedLabel}
            isSelf={isSelf}
            onEdit={() => setEditing(true)}
          />

          {(players.length > 0 || spouse || parents.length > 0 || children.length > 0) && (
            <div className="rsd-card" style={{ padding: "16px 20px", gap: 14 }}>
              {players.length > 0 && <PlayersRow players={players} />}
              {spouse && (
                <RelationRow label="Spouse" people={[spouse]} />
              )}
              {parents.length > 0 && (
                <RelationRow label={parents.length === 1 ? "Parent" : "Parents"} people={parents} />
              )}
              {children.length > 0 && (
                <RelationRow
                  label={children.length === 1 ? "Child" : "Children"}
                  people={children}
                />
              )}
            </div>
          )}

          {isStaff && <NotesPanel memberId={member.id} initialNotes={notes} />}
        </>
      )}
    </>
  );
}

function NotesPanel({ memberId, initialNotes }: { memberId: string; initialNotes: string }) {
  const [value, setValue] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value !== saved;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberNotes(memberId, value);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(value);
    });
  }

  return (
    <div className="rsd-card" style={{ padding: "16px 20px", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.Pencil width={12} height={12} />
          Member notes
        </span>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Board only — the member can&apos;t see these
        </span>
      </div>

      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Notes for the board — follow-ups, context… (the member can't see these)"
        rows={4}
        disabled={pending}
      />

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={14} height={14} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {!dirty && saved && !pending && (
          <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>Saved</span>
        )}
        <Pill variant="accent" size="sm" onClick={handleSave} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save notes"}
        </Pill>
      </div>
    </div>
  );
}

function ProfileCard({
  member,
  name,
  birthdayLabel,
  anniversaryLabel,
  deceasedLabel,
  isSelf,
  onEdit,
}: {
  member: DetailMember;
  name: string;
  birthdayLabel: string | null;
  anniversaryLabel: string | null;
  deceasedLabel: string | null;
  isSelf: boolean;
  onEdit: () => void;
}) {
  const headerAvatar = resolveAvatarUrl(member, 176);
  return (
    <div className="rsd-card" style={{ padding: "20px 24px", gap: 18 }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            width: 88,
            height: 88,
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
          {headerAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerAvatar}
              alt=""
              width={88}
              height={88}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          ) : (
            <Icons.User width={36} height={36} style={{ color: "var(--gw-fg-muted)" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            {name}
          </h2>
          <div
            style={{
              fontSize: 12,
              color: "var(--gw-fg-muted)",
              fontWeight: 600,
              marginTop: 4,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
            {member.nickname && (
              <span style={{ fontStyle: "italic" }}>&ldquo;{member.nickname}&rdquo;</span>
            )}
            {member.directory_category === "extended" && (
              <span className="rsd-chip rsd-chip-mute">Extended family</span>
            )}
            {member.directory_category === "memorial" && (
              <span className="rsd-chip rsd-chip-mute">Asleep in Jesus</span>
            )}
            {!member.email && member.directory_category !== "memorial" && (
              <span className="rsd-chip rsd-chip-mute">Directory only</span>
            )}
            {member.status !== "approved" && (
              <span className="rsd-chip rsd-chip-warn">{member.status}</span>
            )}
          </div>
        </div>
        {isSelf && (
          <Pill variant="ghost" size="sm" onClick={onEdit}>
            <Icons.Pencil width={12} height={12} />
            Edit profile
          </Pill>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        <ContactField icon={<Icons.Phone width={14} height={14} />} label="Phone" value={member.phone}>
          {member.phone ? (
            <a href={`tel:${member.phone}`} style={{ color: "var(--gw-fg)", textDecoration: "none" }}>
              {member.phone}
            </a>
          ) : null}
        </ContactField>
        <ContactField icon={<Icons.Mail width={14} height={14} />} label="Email" value={member.email}>
          {member.email ? (
            <a
              href={`mailto:${member.email}`}
              style={{
                color: "var(--gw-fg)",
                textDecoration: "none",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {member.email}
            </a>
          ) : null}
        </ContactField>
        <ContactField
          icon={<Icons.Calendar width={14} height={14} />}
          label="Birthday"
          value={birthdayLabel}
        >
          {birthdayLabel}
        </ContactField>
        {anniversaryLabel && (
          <ContactField
            icon={<Icons.Heart width={14} height={14} />}
            label="Anniversary"
            value={anniversaryLabel}
          >
            {anniversaryLabel}
          </ContactField>
        )}
        {member.home_phone && (
          <ContactField
            icon={<Icons.Phone width={14} height={14} />}
            label="Home phone"
            value={member.home_phone}
          >
            <a href={`tel:${member.home_phone}`} style={{ color: "var(--gw-fg)", textDecoration: "none" }}>
              {member.home_phone}
            </a>
          </ContactField>
        )}
        {member.address && (
          <ContactField
            icon={<Icons.MapPin width={14} height={14} />}
            label="Address"
            value={member.address}
          >
            {member.address}
          </ContactField>
        )}
        {deceasedLabel && (
          <ContactField
            icon={<Icons.Shield width={14} height={14} />}
            label="Asleep in Jesus"
            value={deceasedLabel}
          >
            {deceasedLabel}
          </ContactField>
        )}
      </div>
    </div>
  );
}

function ContactField({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {icon}
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600, color: value ? "var(--gw-fg)" : "var(--gw-fg-muted)" }}>
        {value ? children : "—"}
      </span>
    </div>
  );
}

function PlayersRow({ players }: { players: { id: string; name: string; team: string | null }[] }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          minWidth: 80,
        }}
      >
        {players.length === 1 ? "Player" : "Players"}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {players.map((p) => (
          <Link
            key={p.id}
            href={`/portal/directory/players/${p.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 12px",
              borderRadius: 100,
              background: "var(--rsd-accent-bg)",
              color: "var(--rsd-accent)",
              border: "1px solid var(--rsd-accent-line)",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {p.name}
            {p.team && <span style={{ opacity: 0.75 }}>{p.team}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RelationRow({ label, people }: { label: string; people: Related[] }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
          minWidth: 80,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {people.map((p) => (
          <Link
            key={p.relatedId}
            href={`/portal/directory/${p.relatedId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 12px",
              borderRadius: 100,
              background: "var(--rsd-accent-bg)",
              color: "var(--rsd-accent)",
              border: "1px solid var(--rsd-accent-line)",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            {p.relatedName}
          </Link>
        ))}
      </div>
    </div>
  );
}

function EditForm({
  member,
  onCancel,
  onSaved,
}: {
  member: DetailMember;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthday, setBirthday] = useState(member.birthday ?? "");
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await updateOwnProfile({
        fullName: fullName.trim(),
        nickname: nickname.trim() || null,
        phone: phone.trim() || null,
        birthday: birthday || null,
        avatarUrl: avatarUrl.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onSaved();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rsd-card"
      style={{ padding: "20px 24px", gap: 14, flexDirection: "column" }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>Edit your profile</div>

      <Input
        label="Full name *"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoFocus
        required
        disabled={pending}
      />
      <Input
        label="Nickname"
        help='The short name people see for you around the portal — e.g. "Jeff" instead of your full legal name. Your full name still shows on your Directory page. Leave blank to use your first name.'
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="e.g. Jeff (defaults to your first name)"
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
      <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        Leave the avatar blank to use your Gravatar (set one at gravatar.com for your email). Email, role, and approval status are managed by a super-admin.
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={14} height={14} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !fullName.trim()}>
          {pending ? "Saving…" : "Save"}
        </Pill>
      </div>
    </form>
  );
}
