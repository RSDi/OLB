"use client";
// The public Directory's list: search, five ways to group players (A–Z,
// city, team, age group, coaches & volunteers), and one read-only card per
// player. On a team, coaches stay open and Volunteers stays closed until
// tapped. Nothing here changes data or links into the portal, and none of
// it is the registration form.
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Icons } from "../../components/icons";
import { ClearSearchButton } from "../../components/ui";
import { teamLabel } from "../../../lib/teams/volunteer-options";
import type { PublicPlayer, PublicTeam } from "../../../lib/teams/public-directory";
import {
  OPEN_SPOT_LABEL,
  assignedCount,
  directorySearch,
  spotMatches,
  spotsForTeam,
  staffCountLabel,
  volunteerSummary,
  type PublicAssignment,
  type PublicRole,
  type PublicSpot,
} from "../../../lib/teams/public-directory-staff";
import { JerseyNumber, TeamDot } from "../../portal/directory/_shared/TeamBanner";
import { ContactLine, RELATIONSHIP_LABEL, muted } from "../../portal/directory/_shared/PlayerParts";
import { FilterSelect } from "../../components/FilterControls";

type View = "alpha" | "city" | "team" | "age" | "staff";
const VIEWS: { key: View; label: string }[] = [
  { key: "alpha", label: "Alphabetical" },
  { key: "city", label: "By city" },
  { key: "team", label: "By team" },
  { key: "age", label: "By age group" },
  { key: "staff", label: "Coaches & Volunteers" },
];

function ViewButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        minHeight: 44,
        padding: "8px 14px",
        borderRadius: 8,
        border: "none",
        background: active ? "var(--gw-bg-elev)" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const NO_TEAM = "none";
const NO_GROUP = "No age group";
const NO_CITY = "No city given";

// Sort key: last name, then the rest.
function sortName(p: PublicPlayer): string {
  const words = p.full_name.trim().toLowerCase().split(/\s+/);
  return `${words[words.length - 1]} ${words.join(" ")}`;
}

function lastInitial(p: PublicPlayer): string {
  const c = sortName(p).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : "#";
}

// "omaha " and "Omaha" are the same city.
function cityName(p: PublicPlayer): string {
  const c = p.city?.trim().replace(/\s+/g, " ");
  if (!c) return NO_CITY;
  return c.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function ageGroup(p: PublicPlayer): string {
  return p.age_group ?? p.team?.age_group ?? NO_GROUP;
}

// "10U" → 10, so age groups sort youngest first; anything else goes last.
function groupOrder(group: string): number {
  const n = parseInt(group, 10);
  return Number.isNaN(n) ? Infinity : n;
}

interface Section {
  key: string;
  title: string;
  team: PublicTeam | null;
  players: PublicPlayer[];
  // Coaches the search kept. By team and Coaches & Volunteers only.
  coaches: PublicSpot[];
  // Every volunteer seat, including Open Spot. Empty on the other views.
  volunteers: PublicSpot[];
  // Seats the search matched. Drives the collapsed section open.
  volunteerHits: PublicSpot[];
}

// Groups players by a key, keeping the players' order.
function groupBy(players: PublicPlayer[], keyOf: (p: PublicPlayer) => string): Map<string, PublicPlayer[]> {
  const m = new Map<string, PublicPlayer[]>();
  for (const p of players) {
    const k = keyOf(p);
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return m;
}

export function PublicDirectoryList({
  season,
  teams,
  players,
  roles,
  assignments,
}: {
  season: string | null;
  teams: PublicTeam[];
  players: PublicPlayer[];
  roles: PublicRole[];
  assignments: PublicAssignment[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("alpha");
  const [teamId, setTeamId] = useState("all");
  const [group, setGroup] = useState("all");
  // Opens keyed by the search they were made under. A new search drops them,
  // so a match can open the section it found without an effect.
  const [volunteerOpen, setVolunteerOpen] = useState<{ q: string; open: Record<string, boolean> }>({ q: "", open: {} });

  const countByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of players) m.set(p.team_id ?? NO_TEAM, (m.get(p.team_id ?? NO_TEAM) ?? 0) + 1);
    return m;
  }, [players]);

  const staffByTeam = useMemo(() => {
    const m = new Map<string, { coaches: PublicSpot[]; volunteers: PublicSpot[] }>();
    for (const t of teams) {
      m.set(t.id, {
        coaches: spotsForTeam(roles, assignments, t.id, "coach"),
        volunteers: spotsForTeam(roles, assignments, t.id, "volunteer"),
      });
    }
    return m;
  }, [teams, roles, assignments]);

  const hasVolunteers = roles.some((r) => !r.coach);

  const groupNames = useMemo(
    () => [...new Set(players.map(ageGroup))].sort((a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b)),
    [players]
  );

  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () =>
      players
        .filter((p) =>
          directorySearch(
            q,
            [p.full_name, p.team?.name, p.city, p.email, ...p.parents.flatMap((pa) => [pa.name, pa.email])],
            [p.phone, ...p.parents.map((pa) => pa.phone)]
          )
        )
        .sort((a, b) => sortName(a).localeCompare(sortName(b))),
    [players, q]
  );

  const sections = useMemo((): Section[] => {
    const bare = (key: string, title: string, list: PublicPlayer[]): Section => ({
      key,
      title,
      team: null,
      players: list,
      coaches: [],
      volunteers: [],
      volunteerHits: [],
    });
    if (view === "alpha") {
      return [...groupBy(matches, lastInitial)]
        .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
        .map(([k, list]) => bare(k, k, list));
    }
    if (view === "city") {
      return [...groupBy(matches, cityName)]
        .sort(([a], [b]) => (a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b)))
        .map(([k, list]) => bare(k, k, list));
    }
    if (view === "age") {
      const byGroup = groupBy(matches, ageGroup);
      return groupNames
        .filter((g) => group === "all" || g === group)
        .map((g) => bare(g, g, byGroup.get(g) ?? []));
    }
    const picked = teamId === "all" ? teams : teams.filter((t) => t.id === teamId);
    const out: Section[] = picked.map((t) => {
      const staff = staffByTeam.get(t.id) ?? { coaches: [], volunteers: [] };
      return {
        key: t.id,
        title: teamLabel(t),
        team: t,
        players: view === "staff" ? [] : matches.filter((p) => p.team_id === t.id),
        coaches: staff.coaches.filter((c) => spotMatches(q, c)),
        volunteers: staff.volunteers,
        volunteerHits: q ? staff.volunteers.filter((v) => spotMatches(q, v)) : [],
      };
    });
    if (view === "team" && (teamId === "all" || teamId === NO_TEAM)) {
      out.push(bare(NO_TEAM, "Not on a team yet", matches.filter((p) => !p.team_id)));
    }
    return out;
  }, [view, matches, groupNames, group, teams, teamId, staffByTeam, q]);

  // Coaches & Volunteers lists every picked team until a search narrows it.
  // By team keeps a team that has players, or a coach or volunteer the search
  // found. Alphabetical, city and age never list the jobs.
  const shownSections = sections.filter((s) =>
    view === "staff"
      ? !q || s.coaches.length > 0 || s.volunteerHits.length > 0
      : s.players.length > 0 || (q !== "" && (s.coaches.length > 0 || s.volunteerHits.length > 0))
  );
  const coachTotal = shownSections.reduce((n, s) => n + s.coaches.length, 0);
  const volunteerTotal = shownSections.reduce((n, s) => n + assignedCount(q ? s.volunteerHits : s.volunteers), 0);
  const shown = shownSections.reduce((n, s) => n + s.players.length, 0);
  const showTeamFilter = (view === "team" || view === "staff") && teams.length > 0;
  const showGroupFilter = view === "age" && groupNames.length > 1;
  const pickedTeam = showTeamFilter && teamId !== "all" ? teams.find((t) => t.id === teamId) ?? null : null;
  const staffQueryHit =
    q !== "" &&
    [...staffByTeam.values()].some(
      (s) => s.coaches.some((c) => spotMatches(q, c)) || s.volunteers.some((v) => spotMatches(q, v))
    );

  function chosenOpen(teamId: string): boolean | undefined {
    return volunteerOpen.q === q ? volunteerOpen.open[teamId] : undefined;
  }

  function volunteersExpanded(section: Section): boolean {
    if (!section.team) return false;
    const chosen = chosenOpen(section.team.id);
    if (chosen !== undefined) return chosen;
    return q !== "" && section.volunteerHits.length > 0;
  }

  function toggleVolunteers(section: Section) {
    if (!section.team) return;
    const id = section.team.id;
    const next = !volunteersExpanded(section);
    setVolunteerOpen((cur) => {
      const open = cur.q === q ? cur.open : {};
      return { q, open: { ...open, [id]: next } };
    });
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 480 }}>
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
            placeholder="Search players, parents, coaches, volunteers, cities, emails, or phones"
            aria-label="Search the directory"
            style={{
              width: "100%",
              height: 44,
              padding: "0 44px 0 36px",
              borderRadius: 10,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 500,
            }}
          />
          {query && <ClearSearchButton onClear={() => setQuery("")} />}
        </div>
        <div
          role="group"
          aria-label="Group the directory"
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            gap: 2,
            padding: 3,
            borderRadius: 10,
            background: "var(--gw-border)",
          }}
        >
          {VIEWS.map((v) => (
            <ViewButton key={v.key} label={v.label} active={view === v.key} onClick={() => setView(v.key)} />
          ))}
        </div>
      </div>

      {(showTeamFilter || showGroupFilter) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {showTeamFilter && (
            <FilterSelect
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Show a team"
              active={teamId !== "all"}
              leading={pickedTeam ? <TeamDot color={pickedTeam.color} /> : undefined}
            >
              <option value="all">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {teamLabel(t)} (
                  {view === "staff"
                    ? (staffByTeam.get(t.id)?.coaches.length ?? 0) + assignedCount(staffByTeam.get(t.id)?.volunteers ?? [])
                    : countByTeam.get(t.id) ?? 0}
                  )
                </option>
              ))}
              {view === "team" && (countByTeam.get(NO_TEAM) ?? 0) > 0 && (
                <option value={NO_TEAM}>No team yet ({countByTeam.get(NO_TEAM)})</option>
              )}
            </FilterSelect>
          )}
          {showGroupFilter && (
            <FilterSelect
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Show an age group"
              active={group !== "all"}
            >
              <option value="all">All ages</option>
              {groupNames.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </FilterSelect>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {view === "staff" ? staffCountLabel(coachTotal, volunteerTotal) : `${shown} ${shown === 1 ? "player" : "players"}`}
        {season && ` · ${season} season`}
      </div>

      {view === "staff" && teams.length === 0 ? (
        <Empty text="No teams yet." />
      ) : view !== "staff" && players.length === 0 ? (
        <Empty text="No players listed yet." />
      ) : shownSections.length === 0 ? (
        <Empty
          text={query ? "No matches." : "No players here yet."}
          action={
            query && staffQueryHit && view !== "team" && view !== "staff" ? (
              <button type="button" onClick={() => setView("staff")} style={jumpButton}>
                See Coaches &amp; Volunteers
              </button>
            ) : undefined
          }
        />
      ) : (
        shownSections.map((s) => (
          <section key={s.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--gw-fg)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {s.team && <TeamDot color={s.team.color} />}
              {s.title}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: 0, textTransform: "none" }}>
                ·{" "}
                {view === "staff"
                  ? staffCountLabel(s.coaches.length, assignedCount(q ? s.volunteerHits : s.volunteers))
                  : `${s.players.length} ${s.players.length === 1 ? "player" : "players"}`}
              </span>
            </h2>
            {s.team && (view === "staff" || !q || s.coaches.length > 0 || s.volunteerHits.length > 0) && (
              <StaffCard
                coaches={s.coaches}
                volunteers={q && s.volunteerHits.length > 0 ? s.volunteerHits : s.volunteers}
                hasVolunteers={hasVolunteers}
                heading={view === "team"}
                searching={q !== ""}
                expanded={volunteersExpanded(s)}
                onToggle={() => toggleVolunteers(s)}
              />
            )}
            {s.players.length > 0 && (
              <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {s.players.map((p, i) => (
                  <PlayerRow key={p.id} player={p} border={i < s.players.length - 1} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </>
  );
}

function PlayerRow({ player: p, border }: { player: PublicPlayer; border: boolean }) {
  // "Omaha, NE 68106": city and ZIP, no street.
  const place = [p.city?.trim(), [p.state?.trim(), p.postal_code?.trim()].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "12px 24px",
        padding: "14px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {p.jersey_number != null && <JerseyNumber n={p.jersey_number} />}
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>{p.full_name}</span>
          {p.team && <span className="rsd-chip rsd-chip-mute">{teamLabel(p.team)}</span>}
          {p.new_to_program && <span className="rsd-chip rsd-chip-accent">New</span>}
        </div>
        {p.age != null && <div style={muted}>Age {p.age}</div>}
        {place && (
          <div style={{ ...muted, color: "var(--gw-fg)", display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2, color: "var(--gw-fg-muted)" }} />
            {place}
          </div>
        )}
        {(p.phone || p.email) && <ContactLine phone={p.phone} email={p.email} label="Player" />}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {p.parents.length === 0 ? (
          <div style={muted}>No parent info on the registration.</div>
        ) : (
          p.parents.map((pa, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--gw-fg-muted)",
                    textTransform: "uppercase",
                    letterSpacing: ".06em",
                    minWidth: 52,
                  }}
                >
                  {RELATIONSHIP_LABEL[pa.relationship]}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{pa.name}</span>
              </div>
              <div style={{ paddingLeft: 60 }}>
                <ContactLine phone={pa.phone} email={pa.email} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const roleStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

// A team's coaches, open, with Volunteers closed underneath until tapped.
// By team gives the card a dark heading so it reads apart from the players.
function StaffCard({
  coaches,
  volunteers,
  hasVolunteers,
  heading,
  searching,
  expanded,
  onToggle,
}: {
  coaches: PublicSpot[];
  volunteers: PublicSpot[];
  hasVolunteers: boolean;
  heading?: boolean;
  searching: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = volunteerSummary(volunteers);
  const showVolunteers = hasVolunteers && volunteers.length > 0;
  return (
    <div
      className="rsd-card"
      style={{ padding: 0, gap: 0, overflow: "hidden", ...(heading ? { borderColor: "var(--gw-fg)" } : null) }}
    >
      {heading && (
        <div
          style={{
            padding: "9px 18px",
            background: "var(--gw-fg)",
            color: "var(--gw-bg-elev)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          Coaches &amp; Volunteers
        </div>
      )}
      {coaches.length === 0 && !searching ? (
        <div style={{ ...muted, padding: "14px 18px" }}>No coaches listed for this team yet.</div>
      ) : coaches.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "14px 24px",
            padding: "14px 18px",
          }}
        >
          {coaches.map((c) => (
            <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={roleStyle}>{c.role}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{c.name}</span>
              <StaffContact phone={c.phone} email={c.email} />
            </div>
          ))}
        </div>
      ) : null}
      {showVolunteers && (
        <div style={{ borderTop: coaches.length > 0 || !searching ? "1px solid var(--gw-border)" : "none" }}>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={onToggle}
            style={{
              width: "100%",
              minHeight: 56,
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: expanded ? "var(--gw-bg)" : "transparent",
              border: "none",
              color: "var(--gw-fg)",
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--gw-fg)",
                color: "var(--gw-bg-elev)",
              }}
            >
              {expanded ? <Icons.ChevronDown width={18} height={18} /> : <Icons.ChevronRight width={18} height={18} />}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>Volunteers</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{summary}</span>
            </span>
          </button>
          {expanded && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 10,
                padding: "4px 14px 14px",
              }}
            >
              {volunteers.map((v) => (
                <VolunteerSeat key={v.key} spot={v} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A filled seat is a solid card with a name. An empty one is a dashed card
// that only says Open Spot, so the two don't read as the same thing.
function VolunteerSeat({ spot }: { spot: PublicSpot }) {
  const open = !spot.name;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minHeight: 76,
        padding: "12px 14px",
        borderRadius: 12,
        boxSizing: "border-box",
        background: open ? "transparent" : "var(--gw-bg)",
        border: open ? "1.5px dashed var(--gw-border)" : "1px solid var(--gw-border)",
      }}
    >
      <span style={roleStyle}>{spot.role}</span>
      {open ? (
        <span style={{ fontSize: 15, fontWeight: 700, fontStyle: "italic", color: "var(--gw-fg-muted)" }}>{OPEN_SPOT_LABEL}</span>
      ) : (
        <>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>{spot.name}</span>
          <StaffContact phone={spot.phone} email={spot.email} />
        </>
      )}
    </div>
  );
}

// Phone and email as their own tap targets, tall enough for a thumb.
function StaffContact({ phone, email }: { phone: string | null; email: string | null }) {
  if (!phone && !email) return null;
  const link: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 44,
    padding: "4px 0",
    color: "var(--gw-fg)",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    overflowWrap: "anywhere",
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={link}>
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} style={link}>
          {email}
        </a>
      )}
    </div>
  );
}

const jumpButton: CSSProperties = {
  marginTop: 14,
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 100,
  border: "none",
  background: "var(--gw-fg)",
  color: "var(--gw-bg-elev)",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
      {action}
    </div>
  );
}
