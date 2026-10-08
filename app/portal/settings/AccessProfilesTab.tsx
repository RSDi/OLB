"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  BASE_LABEL,
  PERMISSION_GROUPS,
  permissionsForBase,
  profileOf,
  sortProfiles,
  type AccessProfile,
  type PermissionDef,
  type ProfileBase,
} from "../../../lib/auth/access";
import type { MemberRole } from "../../../lib/auth/permissions";

interface ProfileMember {
  role: MemberRole;
  access_profile_id: string | null;
}

async function fetchAll() {
  const supabase = createClient();
  const [profiles, members] = await Promise.all([
    supabase.from("access_profiles").select("id, name, base_role, permissions, is_builtin"),
    supabase
      .from("members")
      .select("role, access_profile_id")
      .eq("status", "approved")
      .is("deleted_at", null),
  ]);
  return { profiles, members };
}

// Settings → Access Profiles: named bundles of permissions (migration 0122).
// A super-admin puts each person on one in Settings → Members. Profiles are
// live: a change here reaches everyone on the profile at once. Super-admin
// only.
export function AccessProfilesTab() {
  const [profiles, setProfiles] = useState<AccessProfile[]>([]);
  const [members, setMembers] = useState<ProfileMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [adding, setAdding] = useState(false);
  // The profile whose permissions are open for editing; the rest show a
  // one-line summary so the list stays short.
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(({ profiles: p, members: m }: Awaited<ReturnType<typeof fetchAll>>) => {
    if (p.error) {
      // Before 0122 there's no table to read.
      setMissing(true);
    } else {
      setMissing(false);
      setProfiles(sortProfiles((p.data as AccessProfile[]) ?? []));
      setMembers((m.data as ProfileMember[]) ?? []);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchAll()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const peopleOn = (profile: AccessProfile) =>
    members.filter((m) => profileOf(m, profiles)?.id === profile.id).length;

  async function run(id: string, write: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    setActing(id);
    const { error: writeError } = await write();
    if (writeError) setError(friendlyError(writeError.message));
    await load();
    setActing(null);
    return !writeError;
  }

  const table = () => createClient().from("access_profiles");

  function togglePermission(profile: AccessProfile, key: string, on: boolean) {
    const permissions = on
      ? [...new Set([...profile.permissions, key])]
      : profile.permissions.filter((k) => k !== key);
    return run(profile.id, () => table().update({ permissions }).eq("id", profile.id));
  }

  function rename(profile: AccessProfile, name: string) {
    return run(profile.id, () => table().update({ name }).eq("id", profile.id));
  }

  function changeBase(profile: AccessProfile, base: ProfileBase) {
    const n = peopleOn(profile);
    if (
      n > 0 &&
      !confirm(
        base === "admin"
          ? `Make ${profile.name} Board-based? ${onIt(n)} ${n === 1 ? "becomes" : "become"} Board, with everything Board can do.`
          : `Make ${profile.name} Member-based? ${onIt(n)} ${n === 1 ? "stops" : "stop"} being Board, and its Settings permissions come off.`
      )
    )
      return;
    // Board-only permissions mean nothing on a Member base; drop them so the
    // profile shows what it really gives.
    const keep = new Set(permissionsForBase(base).map((p) => p.key as string));
    const permissions = profile.permissions.filter((k) => keep.has(k));
    return run(profile.id, () => table().update({ base_role: base, permissions }).eq("id", profile.id));
  }

  function remove(profile: AccessProfile) {
    const n = peopleOn(profile);
    const to = BASE_LABEL[profile.base_role];
    if (
      !confirm(
        n > 0
          ? `Delete ${profile.name}? ${onIt(n)} ${n === 1 ? "moves" : "move"} to ${to}.`
          : `Delete ${profile.name}?`
      )
    )
      return;
    return run(profile.id, () => table().delete().eq("id", profile.id));
  }

  async function create(name: string, base: ProfileBase) {
    setError(null);
    setActing("new");
    const { data, error: writeError } = await table()
      .insert({ name, base_role: base, permissions: [] })
      .select("id")
      .single();
    if (writeError) setError(friendlyError(writeError.message));
    else {
      setAdding(false);
      // Open the new profile so its permissions can be ticked straight away.
      setOpenId((data as { id: string }).id);
    }
    await load();
    setActing(null);
  }

  if (loading) {
    return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;
  }
  if (missing) {
    return (
      <div className="rsd-card" style={{ maxWidth: 760, fontSize: 13, color: "var(--gw-fg-muted)" }}>
        Access profiles need database migration 0122. Apply it in the Supabase SQL editor, then reload this page.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 480 }}>
          A profile is a set of permissions you give someone in one step, in Settings → Members. Changes here reach
          everyone on the profile right away. Board-based profiles also get everything Board can do.
        </div>
        {!adding && (
          <span data-tour="access-profiles-new" style={{ display: "inline-flex" }}>
            <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Icons.Plus width={14} height={14} /> New profile
            </Pill>
          </span>
        )}
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

      {adding && (
        <NewProfileForm pending={acting === "new"} onCancel={() => setAdding(false)} onCreate={create} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {profiles.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            people={peopleOn(p)}
            pending={acting === p.id}
            open={openId === p.id}
            onOpen={() => setOpenId(openId === p.id ? null : p.id)}
            onToggle={(key, on) => togglePermission(p, key, on)}
            onRename={(name) => rename(p, name)}
            onChangeBase={(base) => changeBase(p, base)}
            onDelete={() => remove(p)}
          />
        ))}
        <div className="rsd-card" style={{ padding: "14px 18px", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Super-admin</span>
            <span className="rsd-chip rsd-chip-accent">Everything</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
            Super-admins can do everything, including managing members and these profiles. It can&apos;t be changed.
          </div>
        </div>
      </div>
    </div>
  );
}

const onIt = (n: number) => (n === 1 ? "The person on it" : `The ${n} people on it`);

function friendlyError(message: string): string {
  if (/access_profiles_name_key|duplicate key/i.test(message)) return "There's already a profile with that name.";
  return message;
}

function ProfileCard({
  profile,
  people,
  pending,
  open,
  onOpen,
  onToggle,
  onRename,
  onChangeBase,
  onDelete,
}: {
  profile: AccessProfile;
  people: number;
  pending: boolean;
  open: boolean;
  onOpen: () => void;
  onToggle: (key: string, on: boolean) => void;
  onRename: (name: string) => Promise<boolean | undefined>;
  onChangeBase: (base: ProfileBase) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(profile.name);
  const offered = permissionsForBase(profile.base_role);
  const held = new Set(profile.permissions);
  const summary = offered.filter((d) => held.has(d.key)).map((d) => (d.group === "settings" ? `Settings: ${d.label}` : d.label));

  return (
    <div
      data-tour="access-profiles-card"
      className="rsd-card"
      style={{ padding: "14px 18px", gap: 12, opacity: pending ? 0.5 : 1, transition: "opacity 150ms" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {renaming ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim() || name.trim() === profile.name) return setRenaming(false);
              if (await onRename(name.trim())) setRenaming(false);
            }}
            style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 220 }}
          >
            <div style={{ flex: 1 }}>
              <Input aria-label="Profile name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
            </div>
            <Pill variant="ghost" size="sm" onClick={() => { setName(profile.name); setRenaming(false); }}>
              Cancel
            </Pill>
            <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
              Save
            </Pill>
          </form>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{profile.name}</span>
            {profile.is_builtin && <span className="rsd-chip rsd-chip-mute">Built-in</span>}
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
              {people === 1 ? "1 person" : `${people} people`}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <SmallBtn onClick={onOpen} disabled={false}>
                {open ? "Done" : "Edit permissions"}
              </SmallBtn>
              {!profile.is_builtin && (
                <>
                  <select
                    aria-label="Based on"
                    title="Board-based profiles also get everything Board can do"
                    value={profile.base_role}
                    disabled={pending}
                    onChange={(e) => onChangeBase(e.target.value as ProfileBase)}
                    style={{
                      height: 30,
                      padding: "0 8px",
                      borderRadius: 8,
                      border: "1px solid var(--gw-border)",
                      background: "var(--gw-bg-elev)",
                      color: "var(--gw-fg)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    <option value="member">Based on Member</option>
                    <option value="admin">Based on Board</option>
                  </select>
                  <SmallBtn onClick={() => setRenaming(true)} disabled={pending}>
                    Rename
                  </SmallBtn>
                  <SmallBtn onClick={onDelete} disabled={pending} danger>
                    Delete
                  </SmallBtn>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", marginTop: -4 }}>
        {profile.base_role === "admin" ? "Everything Board can do" : "What every member can do"}
        {summary.length > 0 ? (
          <>
            , plus <strong style={{ color: "var(--gw-fg)" }}>{summary.join(", ")}</strong>
          </>
        ) : null}
        .
      </div>

      {open && PERMISSION_GROUPS.map((g) => {
        const defs = offered.filter((d) => d.group === g.key);
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
              {defs.map((d) => (
                <PermissionToggle
                  key={d.key}
                  def={d}
                  on={held.has(d.key)}
                  disabled={pending}
                  onChange={(on) => onToggle(d.key, on)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PermissionToggle({
  def,
  on,
  disabled,
  onChange,
}: {
  def: PermissionDef;
  on: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 10,
        border: `1px solid ${on ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
        background: "var(--gw-bg)",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={on}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: "var(--rsd-accent-fill)" }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg)" }}>{def.label}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--gw-fg-muted)", lineHeight: 1.35 }}>{def.desc}</span>
      </span>
    </label>
  );
}

function SmallBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        background: danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)",
        color: danger ? "var(--gw-error)" : "var(--gw-fg)",
        border: `1px solid ${danger ? "var(--gw-error)" : "var(--gw-border)"}`,
        fontSize: 12,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function NewProfileForm({
  pending,
  onCancel,
  onCreate,
}: {
  pending: boolean;
  onCancel: () => void;
  onCreate: (name: string, base: ProfileBase) => void;
}) {
  const [name, setName] = useState("");
  const [base, setBase] = useState<ProfileBase>("member");
  return (
    <form
      className="rsd-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim(), base);
      }}
      style={{ marginBottom: 16, gap: 12 }}
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <Input
            label="Name"
            placeholder="Treasurer, Registrar, Travel Coordinator…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <Select
            label="Based on"
            help="Board-based profiles also get everything Board can do."
            value={base}
            onChange={(e) => setBase(e.target.value as ProfileBase)}
          >
            <option value="member">Member</option>
            <option value="admin">Board</option>
          </Select>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>Tick its permissions once it&apos;s made.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
          Create profile
        </Pill>
      </div>
    </form>
  );
}
