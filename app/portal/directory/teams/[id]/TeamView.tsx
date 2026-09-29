"use client";
// A team's page: who coaches and volunteers for it, and its roster.
// Super-admins fill open spots from here; the picker lists everyone who said
// on their registration they'd help with that job first, then this team's
// parents, then every other member (a volunteer doesn't have to be a parent).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { ClearSearchButton } from "../../../../components/ui";
import { assignVolunteer, removeVolunteer } from "../../../../../lib/teams/volunteer-actions";
import type { OlbTeamVolunteer, OlbVolunteerRole } from "../../../../../lib/teams/types";
import type { AssignablePerson, TeamWithStaff } from "../../../../../lib/teams/volunteer-data";
import { roleSpots, teamColorHex, teamLabel, wantsRole } from "../../../../../lib/teams/volunteer-options";
import type { DirectoryPlayer } from "../../_shared/data";
import { Avatar, capStyle, JerseyNumber, TeamFacts } from "../../_shared/TeamBanner";

function RoleIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  const p = { width: 17, height: 17 };
  if (n.includes("coach")) return <Icons.Shield {...p} />;
  if (n.includes("mom") || n.includes("parent")) return <Icons.Heart {...p} />;
  if (n.includes("video") || n.includes("film")) return <Icons.Video {...p} />;
  if (n.includes("photo")) return <Icons.Image {...p} />;
  if (n.includes("clock")) return <Icons.Clock {...p} />;
  if (n.includes("score")) return <Icons.CheckCircle {...p} />;
  return <Icons.User {...p} />;
}

export function TeamView({
  team,
  roles,
  roster,
  canManage,
  people,
  teamParentIds,
}: {
  team: TeamWithStaff;
  roles: OlbVolunteerRole[];
  roster: DirectoryPlayer[];
  canManage: boolean;
  people: AssignablePerson[];
  teamParentIds: string[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<OlbVolunteerRole | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const spots = roleSpots(roles, team.volunteers);
  const filled = spots.filter((s) => s.volunteer).length;
  const hex = teamColorHex(team.color);

  async function remove(v: OlbTeamVolunteer, roleName: string) {
    const who = v.member.full_name ?? v.member.email ?? "this person";
    if (!confirm(`Take ${who} off ${roleName} for ${teamLabel(team)}?`)) return;
    setError(null);
    setBusy(v.id);
    const res = await removeVolunteer(v.id);
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <>
      <Link
        href="/portal/directory"
        prefetch={false}
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
        <Icons.ChevronLeft width={13} height={13} />
        Directory
      </Link>

      <section style={{ background: "var(--rsd-frame)", color: "var(--rsd-frame-fg)", borderRadius: 18, overflow: "hidden" }}>
        <div style={{ height: 8, background: hex }} />
        <div
          style={{
            padding: "22px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            {team.division && (
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".16em", color: "var(--rsd-accent-fill)", textTransform: "uppercase" }}>
                {team.division}
              </span>
            )}
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--rsd-display)",
                fontSize: 52,
                fontWeight: 800,
                lineHeight: 0.9,
                textTransform: "uppercase",
              }}
            >
              {teamLabel(team)}
            </h1>
            <TeamFacts team={team} playerCount={roster.length} color="var(--rsd-frame-fg-2)" />
          </div>
          {spots.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: "var(--rsd-display)" }}>
                <span style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, color: "var(--rsd-accent-fill)" }}>{filled}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--rsd-frame-fg-3)" }}>/ {spots.length}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-frame-fg-2)" }}>volunteer spots filled</span>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div
          role="alert"
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
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section style={{ flex: "1 1 520px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: "-.01em" }}>Staff &amp; volunteers</h2>
            {canManage && (
              <Link
                href="/portal/settings"
                prefetch={false}
                style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
              >
                Manage roles in Settings
              </Link>
            )}
          </div>
          {spots.length === 0 ? (
            <div className="rsd-card" style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              No volunteer roles set up yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {spots.map((s, i) => {
                const v = s.volunteer;
                return (
                  <div
                    key={v?.id ?? `${s.role.id}-open-${i}`}
                    className={v ? "rsd-card" : undefined}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      padding: 16,
                      borderRadius: 14,
                      minHeight: 118,
                      boxSizing: "border-box",
                      opacity: busy === v?.id ? 0.5 : 1,
                      ...(v ? {} : { background: "var(--gw-bg)", border: "1.5px dashed var(--gw-border)" }),
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span
                        style={{
                          width: 34,
                          height: 34,
                          flexShrink: 0,
                          borderRadius: 9,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: v ? "var(--gw-fg)" : "var(--gw-border)",
                          color: v ? "var(--rsd-accent-fill)" : "var(--gw-fg-muted)",
                        }}
                      >
                        <RoleIcon name={s.role.name} />
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                        <span style={capStyle}>{s.role.name}</span>
                        {s.role.description && (
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{s.role.description}</span>
                        )}
                      </div>
                      {s.role.is_leadership && <span className="rsd-chip rsd-chip-accent" style={{ fontSize: 10 }}>Leadership</span>}
                    </div>
                    {v ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <Avatar name={v.member.full_name} size={40} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                          <Link
                            href={`/portal/directory/${v.member.id}`}
                            prefetch={false}
                            style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)", textDecoration: "none" }}
                          >
                            {v.member.full_name ?? v.member.email ?? "Unnamed member"}
                          </Link>
                          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", display: "flex", gap: "0 10px", flexWrap: "wrap" }}>
                            {v.member.phone && (
                              <a href={`tel:${v.member.phone.replace(/[^\d+]/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>
                                {v.member.phone}
                              </a>
                            )}
                            {v.member.email && (
                              <a href={`mailto:${v.member.email}`} style={{ color: "inherit", textDecoration: "none", overflowWrap: "anywhere" }}>
                                {v.member.email}
                              </a>
                            )}
                          </span>
                        </div>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => remove(v, s.role.name)}
                            disabled={busy === v.id}
                            style={smallBtn}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg-muted)" }}>Open spot</span>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setError(null);
                              setPicking(s.role);
                            }}
                            style={{ ...smallBtn, background: "var(--rsd-accent-fill)", borderColor: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)" }}
                          >
                            <Icons.Plus width={12} height={12} /> Assign
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rsd-card" style={{ flex: "0 1 340px", padding: 0, gap: 0, overflow: "hidden", minWidth: 280 }}>
          <div
            style={{
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--gw-border)",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Roster</h2>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
              {roster.length} {roster.length === 1 ? "player" : "players"}
            </span>
          </div>
          {roster.length === 0 ? (
            <div style={{ padding: "20px 18px", fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              No players on this team yet.
            </div>
          ) : (
            roster.map((p, i) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 18px",
                  borderTop: i === 0 ? "none" : "1px solid var(--gw-border)",
                }}
              >
                {p.jersey_number != null ? <JerseyNumber n={p.jersey_number} /> : <Avatar name={p.full_name} size={28} />}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{p.full_name}</span>
                  {p.parents.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: "var(--gw-fg-muted)" }}>
                      {p.parents.map((pa) => pa.member?.full_name).filter(Boolean).join(" & ")}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      {picking && (
        <Picker
          role={picking}
          team={team}
          people={people}
          teamParentIds={teamParentIds}
          onClose={() => setPicking(null)}
          onAssigned={() => {
            setPicking(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function Picker({
  role,
  team,
  people,
  teamParentIds,
  onClose,
  onAssigned,
}: {
  role: OlbVolunteerRole;
  team: TeamWithStaff;
  people: AssignablePerson[];
  teamParentIds: string[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const taken = new Set(team.volunteers.filter((v) => v.role_id === role.id).map((v) => v.member.id));
    const parents = new Set(teamParentIds);
    const q = query.trim().toLowerCase();
    const list = people.filter(
      (p) =>
        !taken.has(p.id) &&
        (!q || [p.full_name, p.email, p.phone].filter(Boolean).join(" ").toLowerCase().includes(q))
    );
    const interested = list.filter((p) => wantsRole(p.volunteer_interests, role));
    const rest = list.filter((p) => !wantsRole(p.volunteer_interests, role));
    return {
      interested,
      teamParents: rest.filter((p) => parents.has(p.id)),
      everyone: rest.filter((p) => !parents.has(p.id)),
    };
  }, [people, team.volunteers, role, teamParentIds, query]);

  // Everyone else can be a long list; show a page of it until they search.
  const EVERYONE_LIMIT = 40;
  const everyone = query ? groups.everyone : groups.everyone.slice(0, EVERYONE_LIMIT);
  const hidden = groups.everyone.length - everyone.length;
  const parentIds = new Set(teamParentIds);

  async function pick(p: AssignablePerson) {
    setError(null);
    setBusy(p.id);
    const res = await assignVolunteer(team.id, role.id, p.id);
    setBusy(null);
    if (res.error) setError(res.error);
    else onAssigned();
  }

  const row = (p: AssignablePerson, highlight: boolean) => (
    <button
      key={p.id}
      type="button"
      onClick={() => pick(p)}
      disabled={busy !== null}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid",
        borderColor: highlight ? "var(--rsd-accent-fill)" : "var(--gw-border)",
        background: highlight ? "var(--rsd-accent-bg)" : "var(--gw-bg-elev)",
        textAlign: "left",
        cursor: busy ? "wait" : "pointer",
        opacity: busy && busy !== p.id ? 0.6 : 1,
        color: "var(--gw-fg)",
      }}
    >
      <Avatar name={p.full_name ?? p.email} dark={highlight} size={36} />
      <span style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{p.full_name ?? p.email ?? "Unnamed member"}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", overflowWrap: "anywhere" }}>
          {[parentIds.has(p.id) ? `Parent on ${teamLabel(team)}` : null, p.email].filter(Boolean).join(" · ")}
        </span>
        {highlight && p.volunteer_interests && (
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg)" }}>Signed up for: {p.volunteer_interests}</span>
        )}
      </span>
      {busy === p.id && <span style={{ fontSize: 12, fontWeight: 700 }}>Adding…</span>}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Assign ${role.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(11,11,12,.38)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          width: "min(460px, 100vw)",
          height: "100%",
          background: "var(--gw-bg-elev)",
          boxShadow: "-12px 0 40px rgba(0,0,0,.18)",
          padding: 24,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={capStyle}>Assign · {teamLabel(team)}</span>
            <span
              style={{
                fontFamily: "var(--rsd-display)",
                fontSize: 30,
                fontWeight: 800,
                lineHeight: 1,
                textTransform: "uppercase",
              }}
            >
              {role.name}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icons.X width={16} height={16} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anyone by name, email or phone"
            aria-label="Search members"
            autoFocus
            style={{
              width: "100%",
              height: 40,
              padding: "0 40px 0 14px",
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

        {error && (
          <div role="alert" style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)" }}>
            {error}
          </div>
        )}

        {groups.interested.length > 0 && (
          <PickerGroup title={`Signed up to help with ${role.name.toLowerCase()}`}>
            {groups.interested.map((p) => row(p, true))}
          </PickerGroup>
        )}
        {groups.teamParents.length > 0 && (
          <PickerGroup title={`Parents on ${teamLabel(team)}`}>{groups.teamParents.map((p) => row(p, false))}</PickerGroup>
        )}
        {everyone.length > 0 && (
          <PickerGroup title="Everyone else">
            {everyone.map((p) => row(p, false))}
            {hidden > 0 && (
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", padding: "4px 2px" }}>
                {hidden} more. Search to find them.
              </div>
            )}
          </PickerGroup>
        )}
        {groups.interested.length + groups.teamParents.length + everyone.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {query ? "No one matches that search." : "No members to pick from yet."}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          Not listed? Add them in Settings → Members (no email needed), then assign them here.
        </div>
      </div>
    </div>
  );
}

function PickerGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={capStyle}>{title}</span>
      {children}
    </div>
  );
}

const smallBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 12px",
  borderRadius: 100,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};
