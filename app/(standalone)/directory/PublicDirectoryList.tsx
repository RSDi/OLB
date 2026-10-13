"use client";
// The public Directory's list: search, four ways to group players (A–Z,
// city, team, age group), each team's coaches, and one read-only card per
// player. Nothing here changes data or links into the portal.
import { useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { ClearSearchButton } from "../../components/ui";
import { teamLabel } from "../../../lib/teams/volunteer-options";
import type { PublicCoach, PublicPlayer, PublicTeam } from "../../../lib/teams/public-directory";
import { JerseyNumber, TeamDot } from "../../portal/directory/_shared/TeamBanner";
import { ContactLine, RELATIONSHIP_LABEL, muted } from "../../portal/directory/_shared/PlayerParts";
import { FilterSelect, SegButton } from "../../components/FilterControls";

type View = "alpha" | "city" | "team" | "age" | "coaches";
const VIEWS: { key: View; label: string }[] = [
  { key: "alpha", label: "Alphabetical" },
  { key: "city", label: "By city" },
  { key: "team", label: "By team" },
  { key: "age", label: "By age group" },
  { key: "coaches", label: "Coaches" },
];

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
  // A team's coaches that match the search; By team and Coaches only.
  coaches: PublicCoach[];
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
  coaches,
}: {
  season: string | null;
  teams: PublicTeam[];
  players: PublicPlayer[];
  coaches: PublicCoach[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("alpha");
  const [teamId, setTeamId] = useState("all");
  const [group, setGroup] = useState("all");

  const countByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of players) m.set(p.team_id ?? NO_TEAM, (m.get(p.team_id ?? NO_TEAM) ?? 0) + 1);
    return m;
  }, [players]);

  const coachesByTeam = useMemo(() => {
    const m = new Map<string, PublicCoach[]>();
    for (const c of coaches) m.set(c.team_id, [...(m.get(c.team_id) ?? []), c]);
    return m;
  }, [coaches]);

  const groupNames = useMemo(
    () => [...new Set(players.map(ageGroup))].sort((a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b)),
    [players]
  );

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      players
        .filter((p) =>
          matchesSearch(
            q,
            [p.full_name, p.team?.name, p.city, p.email, ...p.parents.flatMap((pa) => [pa.name, pa.email])],
            [p.phone, ...p.parents.map((pa) => pa.phone)]
          )
        )
        .sort((a, b) => sortName(a).localeCompare(sortName(b))),
    [players, q]
  );

  const sections = useMemo((): Section[] => {
    if (view === "alpha") {
      return [...groupBy(matches, lastInitial)]
        .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
        .map(([k, list]) => ({ key: k, title: k, team: null, players: list, coaches: [] }));
    }
    if (view === "city") {
      return [...groupBy(matches, cityName)]
        .sort(([a], [b]) => (a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b)))
        .map(([k, list]) => ({ key: k, title: k, team: null, players: list, coaches: [] }));
    }
    if (view === "age") {
      const byGroup = groupBy(matches, ageGroup);
      return groupNames
        .filter((g) => group === "all" || g === group)
        .map((g) => ({ key: g, title: g, team: null, players: byGroup.get(g) ?? [], coaches: [] }));
    }
    const teamCoaches = (id: string) =>
      (coachesByTeam.get(id) ?? []).filter((c) => matchesSearch(q, [c.name, c.role, c.email], [c.phone]));
    const picked = teamId === "all" ? teams : teams.filter((t) => t.id === teamId);
    const out: Section[] = picked.map((t) => ({
      key: t.id,
      title: teamLabel(t),
      team: t,
      players: view === "coaches" ? [] : matches.filter((p) => p.team_id === t.id),
      coaches: teamCoaches(t.id),
    }));
    if (view === "team" && (teamId === "all" || teamId === NO_TEAM)) {
      out.push({ key: NO_TEAM, title: "Not on a team yet", team: null, players: matches.filter((p) => !p.team_id), coaches: [] });
    }
    return out;
  }, [view, matches, groupNames, group, teams, teamId, coachesByTeam, q]);

  // Coaches lists every picked team, even one with no coaches yet, until a
  // search narrows it; By team keeps a team that has players, or a coach the
  // search found.
  const shownSections = sections.filter((s) =>
    view === "coaches" ? !q || s.coaches.length > 0 : s.players.length > 0 || (q !== "" && s.coaches.length > 0)
  );
  const shown = shownSections.reduce((n, s) => n + (view === "coaches" ? s.coaches.length : s.players.length), 0);
  const showTeamFilter = (view === "team" || view === "coaches") && teams.length > 0;
  const showGroupFilter = view === "age" && groupNames.length > 1;
  const pickedTeam = showTeamFilter && teamId !== "all" ? teams.find((t) => t.id === teamId) ?? null : null;

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
            placeholder="Search players, parents, coaches, cities, emails, or phones"
            aria-label="Search the directory"
            style={{
              width: "100%",
              height: 40,
              padding: "0 40px 0 36px",
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
            <SegButton key={v.key} label={v.label} active={view === v.key} onClick={() => setView(v.key)} />
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
                  {teamLabel(t)} ({view === "coaches" ? coachesByTeam.get(t.id)?.length ?? 0 : countByTeam.get(t.id) ?? 0})
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
        {view === "coaches" ? `${shown} ${shown === 1 ? "coach" : "coaches"}` : `${shown} ${shown === 1 ? "player" : "players"}`}
        {season && ` · ${season} season`}
      </div>

      {view === "coaches" && teams.length === 0 ? (
        <Empty text="No teams yet." />
      ) : view !== "coaches" && players.length === 0 ? (
        <Empty text="No players listed yet." />
      ) : shownSections.length === 0 ? (
        <Empty text={query ? "No matches." : "No players here yet."} />
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
                {view === "coaches"
                  ? `${s.coaches.length} ${s.coaches.length === 1 ? "coach" : "coaches"}`
                  : `${s.players.length} ${s.players.length === 1 ? "player" : "players"}`}
              </span>
            </h2>
            {view === "coaches" ? (
              <CoachesCard coaches={s.coaches} />
            ) : (
              // By team: the team's coaches first. A search shows only the
              // coaches it found.
              s.team && (!q || s.coaches.length > 0) && <CoachesCard coaches={s.coaches} heading />
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

// Whether a player or coach matches the search: any of the words, or at
// least 3 digits of a phone number.
function matchesSearch(q: string, words: (string | null | undefined)[], phones: (string | null | undefined)[]): boolean {
  if (!q) return true;
  if (words.filter(Boolean).join(" ").toLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 3 && phones.some((ph) => ph?.replace(/\D/g, "").includes(digits));
}

// A team's coaches: role, name, phone and email. By team gives it a dark
// "Coaches" heading so it reads apart from the players under it.
function CoachesCard({ coaches, heading }: { coaches: PublicCoach[]; heading?: boolean }) {
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
          Coaches
        </div>
      )}
      {coaches.length === 0 ? (
        <div style={{ ...muted, padding: "14px 18px" }}>No coaches listed for this team yet.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "14px 24px",
            padding: "14px 18px",
          }}
        >
          {coaches.map((c, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                {c.role}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{c.name}</span>
              {(c.phone || c.email) && <ContactLine phone={c.phone} email={c.email} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
    </div>
  );
}
