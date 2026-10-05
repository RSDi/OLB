"use client";
// The public Directory's list: search, four ways to group (A–Z, city, team,
// age group) and one read-only card per player. Nothing here changes data
// or links into the portal.
import { useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { MapLink } from "../../components/MapLink";
import { ClearSearchButton } from "../../components/ui";
import { teamLabel } from "../../../lib/teams/volunteer-options";
import type { PublicPlayer, PublicTeam } from "../../../lib/teams/public-directory";
import { JerseyNumber, TeamDot } from "../../portal/directory/_shared/TeamBanner";
import { ContactLine, RELATIONSHIP_LABEL, muted, playerAddress } from "../../portal/directory/_shared/PlayerParts";

type View = "alpha" | "city" | "team" | "age";
const VIEWS: { key: View; label: string }[] = [
  { key: "alpha", label: "Alphabetical" },
  { key: "city", label: "By city" },
  { key: "team", label: "By team" },
  { key: "age", label: "By age group" },
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
}: {
  season: string | null;
  teams: PublicTeam[];
  players: PublicPlayer[];
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

  const groupNames = useMemo(
    () => [...new Set(players.map(ageGroup))].sort((a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b)),
    [players]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return players
      .filter((p) => {
        if (!q) return true;
        const text = [p.full_name, p.team?.name, p.city, p.email, ...p.parents.flatMap((pa) => [pa.name, pa.email])];
        if (text.filter(Boolean).join(" ").toLowerCase().includes(q)) return true;
        if (digits.length < 3) return false;
        return [p.phone, ...p.parents.map((pa) => pa.phone)].some((ph) => ph?.replace(/\D/g, "").includes(digits));
      })
      .sort((a, b) => sortName(a).localeCompare(sortName(b)));
  }, [players, query]);

  const sections = useMemo((): Section[] => {
    if (view === "alpha") {
      return [...groupBy(matches, lastInitial)]
        .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
        .map(([k, list]) => ({ key: k, title: k, team: null, players: list }));
    }
    if (view === "city") {
      return [...groupBy(matches, cityName)]
        .sort(([a], [b]) => (a === NO_CITY ? 1 : b === NO_CITY ? -1 : a.localeCompare(b)))
        .map(([k, list]) => ({ key: k, title: k, team: null, players: list }));
    }
    if (view === "age") {
      const byGroup = groupBy(matches, ageGroup);
      return groupNames
        .filter((g) => group === "all" || g === group)
        .map((g) => ({ key: g, title: g, team: null, players: byGroup.get(g) ?? [] }));
    }
    const picked = teamId === "all" ? teams : teams.filter((t) => t.id === teamId);
    const out: Section[] = picked.map((t) => ({
      key: t.id,
      title: teamLabel(t),
      team: t,
      players: matches.filter((p) => p.team_id === t.id),
    }));
    if (teamId === "all" || teamId === NO_TEAM) {
      out.push({ key: NO_TEAM, title: "Not on a team yet", team: null, players: matches.filter((p) => !p.team_id) });
    }
    return out;
  }, [view, matches, groupNames, group, teams, teamId]);

  const shownSections = sections.filter((s) => s.players.length > 0);
  const shown = shownSections.reduce((n, s) => n + s.players.length, 0);

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
            placeholder="Search players, parents, cities, emails, or phones"
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

      {view === "team" && teams.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label="All teams" active={teamId === "all"} onClick={() => setTeamId("all")} />
          {teams.map((t) => (
            <Chip
              key={t.id}
              label={teamLabel(t)}
              color={t.color}
              count={countByTeam.get(t.id) ?? 0}
              active={teamId === t.id}
              onClick={() => setTeamId(t.id)}
            />
          ))}
          {(countByTeam.get(NO_TEAM) ?? 0) > 0 && (
            <Chip
              label="No team yet"
              count={countByTeam.get(NO_TEAM) ?? 0}
              active={teamId === NO_TEAM}
              onClick={() => setTeamId(NO_TEAM)}
            />
          )}
        </div>
      )}

      {view === "age" && groupNames.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label="All ages" active={group === "all"} onClick={() => setGroup("all")} />
          {groupNames.map((g) => (
            <Chip key={g} label={g} active={group === g} onClick={() => setGroup(g)} />
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {shown} {shown === 1 ? "player" : "players"}
        {season && ` · ${season} season`}
      </div>

      {players.length === 0 ? (
        <Empty text="No players listed yet." />
      ) : shown === 0 ? (
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
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: 0 }}>
                {s.players.length}
              </span>
            </h2>
            <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
              {s.players.map((p, i) => (
                <PlayerRow key={p.id} player={p} border={i < s.players.length - 1} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function PlayerRow({ player: p, border }: { player: PublicPlayer; border: boolean }) {
  const addr = playerAddress(p);
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
        {addr && (
          <MapLink
            address={addr}
            icon={<Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2, color: "var(--gw-fg-muted)" }} />}
            style={{ ...muted, color: "var(--gw-fg)", display: "flex", gap: 6, alignItems: "flex-start", alignSelf: "flex-start" }}
          />
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

function Chip({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color?: string | null;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 14px",
        borderRadius: 100,
        background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
        color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {color !== undefined && <TeamDot color={color} />}
      {label}
      {count !== undefined && <span style={{ fontWeight: 600, opacity: 0.65 }}>{count}</span>}
    </button>
  );
}

function SegButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 8,
        border: "none",
        background: active ? "var(--gw-bg-elev)" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
    </div>
  );
}
