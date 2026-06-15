"use client";
import { useEffect, useRef, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import type { RelationshipKind } from "../../../lib/auth/member-actions";

// Lightweight shapes — the caller can pass any object with these fields.
export interface EditFormMember {
  id: string;
  email: string | null;
  full_name: string | null;
  nickname?: string | null;
  avatar_url: string | null;
  phone: string | null;
  birthday: string | null;
}

export interface EditFormRelationship {
  id: string;
  member_id: string;
  related_member_id: string;
  relationship: RelationshipKind;
}

export function MemberEditForm({
  member,
  allMembers,
  relationships,
  pending,
  onCancel,
  onSave,
  onAddRelationship,
  onRemoveRelationship,
  onDelete,
}: {
  member: EditFormMember;
  allMembers: EditFormMember[];
  relationships: EditFormRelationship[];
  pending: boolean;
  onCancel: () => void;
  onSave: (fields: {
    full_name: string | null;
    nickname: string | null;
    avatar_url: string | null;
    phone: string | null;
    birthday: string | null;
  }) => void | Promise<void>;
  onAddRelationship: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
  onRemoveRelationship: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
  // Optional — host passes this when soft-delete is allowed (super-admin
  // only). The button is hidden if undefined.
  onDelete?: () => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(member.full_name ?? "");
  const [nickname, setNickname] = useState(member.nickname ?? "");
  const [avatarUrl, setAvatarUrl] = useState(member.avatar_url ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [birthday, setBirthday] = useState(member.birthday ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await onSave({
      full_name: fullName.trim() || null,
      nickname: nickname.trim() || null,
      avatar_url: avatarUrl.trim() || null,
      phone: phone.trim() || null,
      birthday: birthday || null,
    });
  }

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
            <Icons.User width={18} height={18} style={{ color: "var(--gw-fg-muted)" }} />
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
        placeholder="e.g. Jeffrey Wayne Malone"
        autoFocus
        disabled={pending}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Input
          label="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. Jeff"
          disabled={pending}
        />
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Shown on tickets and lists (the full name + middle name only appear in the directory). Defaults to the first name if blank.
        </span>
      </div>
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

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `Delete ${member.full_name ?? member.email ?? "this member"}? They'll move to Settings → Deleted, where you can restore or permanently remove them.`
                )
              ) {
                onDelete();
              }
            }}
            disabled={pending}
            style={{
              padding: "6px 14px",
              borderRadius: 100,
              background: "transparent",
              color: "var(--gw-error)",
              border: "1px solid rgba(229,62,62,.35)",
              fontSize: 12,
              fontWeight: 700,
              cursor: pending ? "not-allowed" : "pointer",
            }}
          >
            Delete
          </button>
        ) : (
          <span />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Pill>
          <Pill variant="accent" size="sm" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Pill>
        </div>
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
  allMembers: EditFormMember[];
  memberById: Map<string, EditFormMember>;
  spouse: EditFormRelationship | undefined;
  parents: EditFormRelationship[];
  children: EditFormRelationship[];
  pending: boolean;
  onAdd: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
  onRemove: (relatedId: string, kind: RelationshipKind) => void | Promise<void>;
}) {
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

function MemberCombobox({
  candidates,
  value,
  onChange,
  disabled,
}: {
  candidates: EditFormMember[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!value) setQuery("");
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? candidates.filter((c) => {
        const name = (c.full_name ?? "").toLowerCase();
        const email = (c.email ?? "").toLowerCase();
        return name.includes(q) || email.includes(q);
      })
    : candidates;
  const visible = filtered.slice(0, 50);

  function pick(c: EditFormMember) {
    onChange(c.id);
    setQuery(c.full_name ?? c.email ?? "Unknown");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(visible.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && visible[highlight]) {
        e.preventDefault();
        pick(visible[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Type a name…"
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (value) onChange("");
        }}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          height: 32,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg)",
          color: "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 600,
        }}
      />
      {open && visible.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 10,
            maxHeight: 240,
            overflowY: "auto",
            background: "var(--gw-bg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.12)",
            padding: 4,
          }}
        >
          {visible.map((c, i) => {
            const name = c.full_name ?? "Unknown";
            const active = i === highlight;
            return (
              <button
                type="button"
                key={c.id}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: active ? "var(--gw-bg-elev)" : "transparent",
                  color: "var(--gw-fg)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {name}
                {c.email && (
                  <span
                    style={{
                      marginLeft: 8,
                      color: "var(--gw-fg-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {c.email}
                  </span>
                )}
              </button>
            );
          })}
          {filtered.length > visible.length && (
            <div
              style={{
                padding: "4px 10px",
                fontSize: 11,
                color: "var(--gw-fg-muted)",
                fontWeight: 600,
              }}
            >
              Showing first {visible.length} of {filtered.length} — keep typing to narrow.
            </div>
          )}
        </div>
      )}
    </div>
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
  existing: EditFormRelationship[];
  candidates: EditFormMember[];
  memberById: Map<string, EditFormMember>;
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
            <MemberCombobox
              candidates={candidates}
              value={picked}
              onChange={setPicked}
              disabled={pending}
            />
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
