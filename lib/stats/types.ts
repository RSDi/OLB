// Stats (0172): shapes shared by the server and the pages. Pure.

import type { BookScores, LineInput, Totals } from "./marks.ts";

export const SCOREBOOK_BUCKET = "scorebooks";
// Photos are made into JPEGs this many pixels on the long side in the browser.
export const PHOTO_MAX_PX = 2400;
export const PHOTO_LINK_TTL_S = 60 * 60;

export interface StatsTeam {
  id: string;
  name: string;
}

export interface RosterPlayer {
  id: string;
  name: string;
  jersey: string | null;
}

export interface StatsGame {
  id: string;
  team_id: string | null;
  game_date: string;
  game_no: number;
  opponent: string;
  our_score: number | null;
  their_score: number | null;
  overtime: boolean;
  quarter_scores: BookScores;
  status: "draft" | "saved";
  saved_at: string | null;
  created_at: string;
}

export type StatsLine = LineInput & Totals & { sort_order: number };

export interface StatsBook {
  id: string;
  status: "uploading" | "reading" | "read" | "failed";
  error: string | null;
  photo_url: string | null;
  unsure: string[];
}

export const GAME_COLS =
  "id, team_id, game_date, game_no, opponent, our_score, their_score, overtime, quarter_scores, status, saved_at, created_at";
export const LINE_COLS =
  "id, game_id, player_id, jersey, book_name, q1, q2, q3, q4, ot, rebounds, fouls, played, tp_written, ft_written, points, fg2, fg3, ftm, fta, sort_order";

// "Fri Nov 14"
export function fmtGameDate(iso: string, withYear = false): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
export function gameLabel(g: Pick<StatsGame, "opponent" | "game_no">, gamesThatDay: number): string {
  const vs = g.opponent ? `vs ${g.opponent}` : "Opponent not set";
  return gamesThatDay > 1 ? `${ORDINAL[g.game_no] ?? `#${g.game_no}`} game · ${vs}` : vs;
}

export function resultText(g: Pick<StatsGame, "our_score" | "their_score" | "overtime">): string {
  const ot = g.overtime ? " OT" : "";
  if (g.our_score == null) return "";
  if (g.their_score == null) return `${g.our_score} – ?${ot}`;
  const r = g.our_score > g.their_score ? "W" : g.our_score < g.their_score ? "L" : "T";
  return `${r} ${g.our_score}–${g.their_score}${ot}`;
}
