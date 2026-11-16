// Season numbers from saved games. Pure.

import { PERIODS, markTotals, type Marks, type Period } from "./marks.ts";

export interface SavedLine extends Marks {
  game_id: string;
  player_id: string | null;
  played: boolean;
  rebounds: number;
  fouls: number;
  points: number;
  fg2: number;
  fg3: number;
  ftm: number;
  fta: number;
}

export interface PlayerSeason {
  player_id: string;
  games: number;
  points: number;
  rebounds: number;
  fouls: number;
  fg: number;
  fg3: number;
  ftm: number;
  fta: number;
  byPeriod: Record<Period, number>;
}

export function emptySeason(player_id: string): PlayerSeason {
  return {
    player_id,
    games: 0,
    points: 0,
    rebounds: 0,
    fouls: 0,
    fg: 0,
    fg3: 0,
    ftm: 0,
    fta: 0,
    byPeriod: { q1: 0, q2: 0, q3: 0, q4: 0, ot: 0 },
  };
}

export function addLine(s: PlayerSeason, l: SavedLine): PlayerSeason {
  if (!l.played) return s;
  const byPeriod = { ...s.byPeriod };
  for (const p of PERIODS) byPeriod[p] += markTotals(l[p]).points;
  return {
    ...s,
    games: s.games + 1,
    points: s.points + l.points,
    rebounds: s.rebounds + l.rebounds,
    fouls: s.fouls + l.fouls,
    fg: s.fg + l.fg2 + l.fg3,
    fg3: s.fg3 + l.fg3,
    ftm: s.ftm + l.ftm,
    fta: s.fta + l.fta,
    byPeriod,
  };
}

// One row per matched player, most points a game first.
export function seasonByPlayer(lines: SavedLine[]): PlayerSeason[] {
  const map = new Map<string, PlayerSeason>();
  for (const l of lines) {
    if (!l.player_id) continue;
    map.set(l.player_id, addLine(map.get(l.player_id) ?? emptySeason(l.player_id), l));
  }
  return [...map.values()].sort((a, b) => perGame(b.points, b.games) - perGame(a.points, a.games) || b.points - a.points);
}

export function perGame(total: number, games: number): number {
  return games ? total / games : 0;
}

export function fmtAvg(total: number, games: number): string {
  return games ? (total / games).toFixed(1) : "–";
}

export function fmtPct(made: number, tries: number): string {
  return tries ? `${Math.round((made / tries) * 100)}%` : "–";
}

// Free throws in each half (overtime counts with the second), in the order
// the book wrote them.
export function ftByHalf(lines: Marks[]): { first: { made: number; tries: number }; second: { made: number; tries: number } } {
  const first = { made: 0, tries: 0 };
  const second = { made: 0, tries: 0 };
  for (const l of lines) {
    for (const p of PERIODS) {
      const t = markTotals(l[p]);
      const half = p === "q1" || p === "q2" ? first : second;
      half.made += t.ftm;
      half.tries += t.fta;
    }
  }
  return { first, second };
}
