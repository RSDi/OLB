// Pool standings for a tournament we host (0150, pools from 0165), with the
// tiebreakers the program communication lists:
//   (1) head-to-head record among the tied teams
//   (2) point differential in games between the tied teams
//   (3) points scored against the tied teams
//   (4) points scored against everyone
//   (5) coin flip: left to a person, so a seat that needs one stays empty
// Whenever a step splits the tied teams, each smaller group starts over at
// step 1. A plain module: the portal, the public page and the server share it.

import type { HostedGame, HostedTeam } from "./types";

type Team = Pick<HostedTeam, "id" | "division_id" | "pool" | "name">;
type Game = Pick<HostedGame, "division_id" | "home_team_id" | "away_team_id" | "home_from" | "away_from" | "home_score" | "away_score">;

export interface StandingRow {
  teamId: string;
  w: number;
  l: number;
  pf: number;
  pa: number;
  // Shares its place with the rows next to it marked the same way: only a
  // coin flip separates them.
  tied: boolean;
}

export interface PoolStandings {
  pool: number | null;
  rows: StandingRow[];
  games: number;
  left: number;
  done: boolean;
}

const scored = (g: Game): g is Game & { home_score: number; away_score: number; home_team_id: string; away_team_id: string } =>
  g.home_score != null && g.away_score != null && !!g.home_team_id && !!g.away_team_id;

// The pools a division's teams play in: [null] when nobody has a pool.
export function poolsOf(teams: Team[], divisionId: string): (number | null)[] {
  const pools = [...new Set(teams.filter((t) => t.division_id === divisionId).map((t) => t.pool ?? null))];
  const numbered = pools.filter((p): p is number => p != null).sort((a, b) => a - b);
  return numbered.length ? numbered : [null];
}

// The games that count for a pool: in the division, between two of its
// teams, and not a seat game (a placement game fed by the standings).
export function poolGames<G extends Game>(games: G[], teams: Team[], divisionId: string, pool: number | null): G[] {
  const ids = new Set(teams.filter((t) => t.division_id === divisionId && (pool == null || t.pool === pool)).map((t) => t.id));
  return games.filter(
    (g) => g.division_id === divisionId && !g.home_from && !g.away_from && !!g.home_team_id && !!g.away_team_id && ids.has(g.home_team_id) && ids.has(g.away_team_id)
  );
}

export function poolStandings(games: Game[], teams: Team[], divisionId: string, pool: number | null): PoolStandings {
  const members = teams.filter((t) => t.division_id === divisionId && (pool == null || t.pool === pool));
  const pg = poolGames(games, teams, divisionId, pool);
  const played = pg.filter(scored);
  const rec = new Map(members.map((t) => [t.id, { teamId: t.id, w: 0, l: 0, pf: 0, pa: 0, tied: false }]));
  for (const g of played) {
    const h = rec.get(g.home_team_id)!;
    const a = rec.get(g.away_team_id)!;
    h.pf += g.home_score;
    h.pa += g.away_score;
    a.pf += g.away_score;
    a.pa += g.home_score;
    if (g.home_score > g.away_score) {
      h.w++;
      a.l++;
    } else if (g.away_score > g.home_score) {
      a.w++;
      h.l++;
    }
  }
  const name = new Map(members.map((t) => [t.id, t.name]));

  // Among a group of teams: the games between them only.
  const among = (ids: string[]) => {
    const set = new Set(ids);
    const out = new Map(ids.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }]));
    for (const g of played) {
      if (!set.has(g.home_team_id) || !set.has(g.away_team_id)) continue;
      const h = out.get(g.home_team_id)!;
      const a = out.get(g.away_team_id)!;
      h.pf += g.home_score;
      h.pa += g.away_score;
      a.pf += g.away_score;
      a.pa += g.home_score;
      if (g.home_score > g.away_score) {
        h.w++;
        a.l++;
      } else if (g.away_score > g.home_score) {
        a.w++;
        h.l++;
      }
    }
    return out;
  };
  const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0.5);

  // Orders a group of teams level on record, by the tiebreakers.
  const breakTie = (ids: string[]): { ids: string[]; tied: boolean }[] => {
    if (ids.length < 2) return ids.map((id) => ({ ids: [id], tied: false }));
    const m = among(ids);
    const steps: ((id: string) => number)[] = [
      (id) => pct(m.get(id)!.w, m.get(id)!.l),
      (id) => m.get(id)!.pf - m.get(id)!.pa,
      (id) => m.get(id)!.pf,
      (id) => rec.get(id)!.pf,
    ];
    for (const key of steps) {
      const groups = splitBy(ids, key);
      if (groups.length > 1) return groups.flatMap((grp) => breakTie(grp));
    }
    return [{ ids: [...ids].sort((a, b) => (name.get(a) ?? "").localeCompare(name.get(b) ?? "")), tied: true }];
  };

  // First by record, then each level group by the tiebreakers.
  const byRecord = splitBy([...rec.keys()], (id) => pct(rec.get(id)!.w, rec.get(id)!.l) * 1000 + rec.get(id)!.w);
  const rows: StandingRow[] = [];
  for (const grp of byRecord) {
    for (const part of breakTie(grp)) {
      for (const id of part.ids) rows.push({ ...rec.get(id)!, tied: part.tied && part.ids.length > 1 });
    }
  }
  const left = pg.length - played.length;
  return { pool, rows, games: pg.length, left, done: pg.length > 0 && left === 0 };
}

// Groups ids by a number, highest first.
function splitBy(ids: string[], key: (id: string) => number): string[][] {
  const keyed = ids.map((id) => ({ id, k: key(id) })).sort((a, b) => b.k - a.k);
  const out: string[][] = [];
  for (const x of keyed) {
    const last = out[out.length - 1];
    if (last && Math.abs(key(last[0]) - x.k) < 1e-9) last.push(x.id);
    else out.push([x.id]);
  }
  return out;
}

// A seat like 'P:1:2' (Pool 1, 2nd).
export function parseSeat(from: string | null | undefined): { pool: number; place: number } | null {
  const m = from ? /^P:([1-8]):([1-9])$/.exec(from) : null;
  return m ? { pool: Number(m[1]), place: Number(m[2]) } : null;
}

const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export const placeName = (n: number) => PLACES[n - 1] ?? `${n}th`;

// "Pool 1 · 2nd" (or "2nd" for a division with one pool).
export function seatLabel(seat: { pool: number; place: number }, onePool = false): string {
  return onePool ? placeName(seat.place) : `Pool ${seat.pool} · ${placeName(seat.place)}`;
}

// Who sits in a seat. A team id once its pool is done; null while the pool
// is still playing; undefined when only a coin flip decides it (leave the
// seat to a person).
export function seatTeam(games: Game[], teams: Team[], divisionId: string, seat: { pool: number; place: number }): string | null | undefined {
  const pools = poolsOf(teams, divisionId);
  const pool = pools.includes(seat.pool) ? seat.pool : pools[0] === null && seat.pool === 1 ? null : seat.pool;
  const st = poolStandings(games, teams, divisionId, pool);
  if (!st.done) return null;
  const row = st.rows[seat.place - 1];
  if (!row) return null;
  return row.tied ? undefined : row.teamId;
}
