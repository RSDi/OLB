// How the live page and the scorer's table read a game (0165): who's on
// each side (a team, or a seat like "Pool 1 · 1st" with who leads it so
// far), and whether it's final, on the court now, or still to come. Pure
// and safe for client components.

import { formatDay, formatTime, toMinutes } from "./logic.ts";
import { parseSeat, poolStandings, poolsOf, seatLabel } from "./standings.ts";
import type { HostedGame } from "./types";
import type { LiveData, LiveTeam } from "./live";

export interface Clock {
  date: string; // YYYY-MM-DD in Central time
  minutes: number; // minutes into that day
}

export type GameState = "final" | "now" | "later" | "waiting";

export const isFinal = (g: HostedGame) => g.home_score != null && g.away_score != null;

export function gameState(g: HostedGame, now: Clock, gameMinutes: number): GameState {
  if (isFinal(g)) return "final";
  const start = toMinutes(g.starts_at);
  if (!g.plays_on || start == null) return "later";
  if (g.plays_on > now.date || (g.plays_on === now.date && start > now.minutes)) return "later";
  if (g.plays_on === now.date && now.minutes < start + gameMinutes + 30) return "now";
  // Started a while ago with no score yet.
  return "waiting";
}

export function sortGames(games: HostedGame[]): HostedGame[] {
  return [...games].sort(
    (a, b) =>
      (a.plays_on ?? "9999").localeCompare(b.plays_on ?? "9999") ||
      (toMinutes(a.starts_at) ?? 9999) - (toMinutes(b.starts_at) ?? 9999) ||
      (a.court ?? 99) - (b.court ?? 99) ||
      a.game_no - b.game_no
  );
}

export interface SideView {
  teamId: string | null;
  name: string; // the team, or the seat ("Pool 1 · 1st", "Winner Game 3")
  leader: string | null; // for an open pool seat: who holds it so far
  open: boolean; // not a team yet
}

export function sideView(data: Pick<LiveData, "teams" | "games">, g: HostedGame, which: "home" | "away"): SideView {
  const teamId = which === "home" ? g.home_team_id : g.away_team_id;
  const from = which === "home" ? g.home_from : g.away_from;
  const team = teamId ? data.teams.find((t) => t.id === teamId) : undefined;
  if (team) return { teamId: team.id, name: team.name, leader: null, open: false };
  const seat = parseSeat(from);
  if (seat && g.division_id) {
    const pools = poolsOf(data.teams, g.division_id);
    const onePool = pools.length === 1;
    const st = poolStandings(data.games, data.teams, g.division_id, onePool && pools[0] === null ? null : seat.pool);
    const row = st.rows[seat.place - 1];
    const played = st.rows.some((r) => r.w + r.l > 0);
    const lead = row && played ? data.teams.find((t) => t.id === row.teamId) : undefined;
    return { teamId: null, name: seatLabel(seat, onePool), leader: lead ? lead.code || lead.name : null, open: true };
  }
  if (from) {
    const src = data.games.find((x) => x.id === from.slice(2));
    return { teamId: null, name: `${from[0] === "W" ? "Winner" : "Loser"} of Game ${src?.game_no ?? "?"}`, leader: null, open: true };
  }
  return { teamId: null, name: "To be set", leader: null, open: true };
}

export function whenLabel(g: HostedGame, withDay = false): string {
  const t = formatTime(g.starts_at);
  if (!g.plays_on) return t || "Time to be set";
  return withDay ? `${formatDay(g.plays_on, { short: true })} ${t}`.trim() : t;
}

export function teamOption(t: LiveTeam, divisionName: string): string {
  return `${t.name} · ${divisionName}`;
}

// A division's address on the TV page: /shootout/tv/hsa.
export function tvSlug(d: { code: string | null; name: string }): string {
  return (d.code || d.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// The admission text from Details (free text, like "Day pass $10 · Weekend
// pass $15\nAges 5 and under free\nPay at the gate.") as prices for the
// admission screen: each line, split at "·", that ends in a price or "free"
// is a price; anything else is a note.
export interface AdmissionPrice {
  label: string;
  price: string; // "$10", "Free"
}

export function admissionPrices(text: string | null): { prices: AdmissionPrice[]; notes: string[] } {
  const prices: AdmissionPrice[] = [];
  const notes: string[] = [];
  for (const line of (text ?? "").split("\n")) {
    const parts = line.split(/\s+[·•|]\s+/).map((x) => x.trim()).filter(Boolean);
    const parsed = parts.map((p) => {
      const m = p.match(/^(.+?)[\s:–—-]*(\$\s?\d+(?:\.\d{2})?|free)\.?$/i);
      return m ? { label: m[1].trim(), price: /free/i.test(m[2]) ? "Free" : m[2].replace(/\s/g, "") } : null;
    });
    if (parts.length && parsed.every(Boolean)) prices.push(...(parsed as AdmissionPrice[]));
    else if (line.trim()) notes.push(line.trim());
  }
  return { prices, notes };
}
