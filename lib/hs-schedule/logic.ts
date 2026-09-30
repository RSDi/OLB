// Pure helpers for the HS Schedule: dates, what a cell shows, totals and
// records, lining one season's weekends up with another's. No database
// calls; safe to import from client components and from node --test.

import type {
  HsGames,
  HsLevel,
  HsOpponent,
  HsOpponentStatus,
  HsWeekend,
  HsWeekendStatus,
} from "./types.ts"; // explicit extension so node --test can load this file

// ─── Statuses ───────────────────────────────────────────────────────────────

// In the order the status menu lists them. `legend` marks the ones the
// spreadsheet's color key explains (its cells G2–G4), shown above the grid.
export const WEEKEND_STATUSES: {
  value: HsWeekendStatus;
  label: string;
  legend: boolean;
}[] = [
  { value: "planned", label: "Planned", legend: false },
  { value: "tentative", label: "Tentative", legend: true },
  { value: "need_facility", label: "Need to secure facility", legend: true },
  { value: "in_process", label: "Final details in process", legend: true },
  { value: "secured", label: "Facility secured", legend: true },
  { value: "canceled", label: "Canceled", legend: false },
  { value: "off", label: "Off / open weekend", legend: false },
];

export function isWeekendStatus(s: unknown): s is HsWeekendStatus {
  return WEEKEND_STATUSES.some((x) => x.value === s);
}

export function weekendStatusLabel(s: HsWeekendStatus): string {
  return WEEKEND_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export const OPPONENT_STATUSES: { value: HsOpponentStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "tentative", label: "On the fence" },
  { value: "declined", label: "Not coming" },
];

export function isOpponentStatus(s: unknown): s is HsOpponentStatus {
  return OPPONENT_STATUSES.some((x) => x.value === s);
}

export function opponentStatusLabel(s: HsOpponentStatus): string {
  return OPPONENT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

// Games aren't played on an off weekend or a canceled one, so they don't
// count toward a team's total.
export function weekendCounts(w: Pick<HsWeekend, "status">): boolean {
  return w.status !== "off" && w.status !== "canceled";
}

// The trip types the spreadsheet uses, in its words (tidied). The field is
// free text, so anything else someone typed is kept and offered too.
export const TRIP_TYPES = ["Local", "Day trip", "Local or day trip", "Overnight", "2 overnights", "Week-long"];

// ─── Dates ──────────────────────────────────────────────────────────────────
// Weekend dates are plain YYYY-MM-DD strings (Postgres `date`); build Dates
// from their parts at UTC noon so no timezone moves them a day.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function toUtc(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(t: Date): string {
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function addDays(ymd: string, n: number): string {
  const t = toUtc(ymd);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUtc(t);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function weekdayOf(ymd: string): number {
  return toUtc(ymd).getUTCDay();
}

// "Nov 12–14", "Jan 31–Feb 1", "Jan 2".
export function formatWeekendDates(startsOn: string, endsOn: string): string {
  const a = toUtc(startsOn);
  const b = toUtc(endsOn);
  const am = MONTHS[a.getUTCMonth()];
  if (startsOn === endsOn) return `${am} ${a.getUTCDate()}`;
  if (a.getUTCMonth() === b.getUTCMonth()) return `${am} ${a.getUTCDate()}–${b.getUTCDate()}`;
  return `${am} ${a.getUTCDate()}–${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}

// "Thu–Sat", "Sat".
export function formatWeekdays(startsOn: string, endsOn: string): string {
  const a = WEEKDAYS[weekdayOf(startsOn)];
  if (startsOn === endsOn) return a;
  return `${a}–${WEEKDAYS[weekdayOf(endsOn)]}`;
}

// "Tuesday, Nov 12" style, for a single day (a game date).
export function formatDay(ymd: string): string {
  const t = toUtc(ymd);
  return `${WEEKDAYS[t.getUTCDay()]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
}

// "2026-11" → "November 2026".
export function monthHeading(ymd: string): string {
  const t = toUtc(ymd);
  return `${MONTHS_LONG[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

// Weekends in schedule order: by start date, then the order they were
// entered (sort_order), then the event name.
export function sortWeekends<T extends Pick<HsWeekend, "starts_on" | "ends_on" | "sort_order" | "event">>(ws: T[]): T[] {
  return [...ws].sort(
    (a, b) =>
      a.starts_on.localeCompare(b.starts_on) ||
      a.sort_order - b.sort_order ||
      a.ends_on.localeCompare(b.ends_on) ||
      a.event.localeCompare(b.event)
  );
}

// Where a new weekend goes: the Friday–Saturday a week after the last one,
// or the first full weekend of November in the season's first year when the
// season is empty (high school season starts in November).
export function nextWeekendDates(season: number, weekends: Pick<HsWeekend, "starts_on" | "ends_on">[]): {
  starts_on: string;
  ends_on: string;
} {
  if (weekends.length === 0) {
    let d = `${season}-11-01`;
    while (weekdayOf(d) !== 5) d = addDays(d, 1);
    return { starts_on: d, ends_on: addDays(d, 1) };
  }
  const last = weekends.map((w) => w.ends_on).sort().at(-1)!;
  let d = addDays(last, 1);
  while (weekdayOf(d) !== 5) d = addDays(d, 1);
  return { starts_on: d, ends_on: addDays(d, 1) };
}

// 52 weeks: the same weekend, a year on, on the same days of the week.
export const YEAR_IN_DAYS = 364;

// The other season's weekends that fall on "the same weekend" as this one:
// shifted by 52 weeks per season apart, overlapping give or take a day.
export function matchingWeekends<T extends Pick<HsWeekend, "starts_on" | "ends_on">>(
  w: Pick<HsWeekend, "starts_on" | "ends_on">,
  thisSeason: number,
  otherSeason: number,
  others: T[]
): T[] {
  const shift = (otherSeason - thisSeason) * YEAR_IN_DAYS;
  const from = addDays(w.starts_on, shift - 1);
  const to = addDays(w.ends_on, shift + 1);
  return others.filter((o) => o.starts_on <= to && o.ends_on >= from);
}

// ─── Cells: our team × weekend ──────────────────────────────────────────────

// A team's key for spotting the same program twice: its contact, else its
// name in lower case.
export function opponentKey(o: Pick<HsOpponent, "contact_id" | "name">): string {
  return o.contact_id ?? `name:${o.name.trim().toLowerCase()}`;
}

// Does this team of ours play that weekend: games entered, or a "?"?
export function levelPlays(games: Pick<HsGames, "games" | "unsure"> | undefined): boolean {
  return !!games && ((games.games ?? 0) > 0 || games.unsure);
}

// The teams a cell lists: the ones coming for this team of ours, plus (when
// this team plays that weekend) the ones coming for every team we bring —
// unless the same program is also listed for this team, when that row wins.
// Rows with a result are kept separately (we can play the same team twice).
export function cellOpponents(
  weekendId: string,
  levelId: string,
  opponents: HsOpponent[],
  plays = true
): HsOpponent[] {
  const mine = opponents.filter((o) => o.weekend_id === weekendId && o.level_id === levelId);
  const taken = new Set(mine.map(opponentKey));
  const all = plays
    ? opponents.filter((o) => o.weekend_id === weekendId && o.level_id === null && !taken.has(opponentKey(o)))
    : [];
  return [...mine, ...all].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

function statusRank(s: HsOpponentStatus): number {
  return s === "confirmed" ? 0 : s === "tentative" ? 1 : 2;
}

function bestStatus(rows: Pick<HsOpponent, "status">[]): HsOpponentStatus {
  return rows.reduce<HsOpponentStatus>((best, o) => (statusRank(o.status) < statusRank(best) ? o.status : best), "declined");
}

// ─── Which of our teams each program plays ──────────────────────────────────

// Our teams that play a weekend: games entered, or a "?".
export function teamsPlaying(
  weekendId: string,
  levels: Pick<HsLevel, "id">[],
  games: Pick<HsGames, "weekend_id" | "level_id" | "games" | "unsure">[]
): Set<string> {
  return new Set(
    levels.filter((l) => levelPlays(games.find((g) => g.weekend_id === weekendId && g.level_id === l.id))).map((l) => l.id)
  );
}

export interface ProgramTeam {
  level: HsLevel;
  status: HsOpponentStatus;
  // Only from its row for all our teams, not one of its own for this team.
  viaAll: boolean;
  // A game with a score: it was played, so it stays.
  scored: boolean;
}

// A program on a weekend, however many rows it has there.
export interface WeekendProgram {
  key: string;
  name: string;
  contact_id: string | null;
  rows: HsOpponent[];
  // Down for all our teams (a row with no team of ours), coming or a maybe.
  all: boolean;
  // Its best: coming if it's coming for any team of ours.
  status: HsOpponentStatus;
  // The teams of ours it plays, in column order.
  teams: ProgramTeam[];
  sort_order: number;
}

// Every program on a weekend, with the teams of ours it plays. A row for one
// of our teams counts for that team. A row for all our teams counts for each
// team of ours that plays that weekend (`playing`), except where the program
// has its own row for that team, which wins (as in cellOpponents).
export function weekendPrograms(
  weekendId: string,
  opponents: HsOpponent[],
  levels: HsLevel[],
  playing: ReadonlySet<string>
): WeekendProgram[] {
  const byKey = new Map<string, HsOpponent[]>();
  for (const o of opponents) {
    if (o.weekend_id !== weekendId) continue;
    const k = opponentKey(o);
    byKey.set(k, [...(byKey.get(k) ?? []), o]);
  }
  const out: WeekendProgram[] = [];
  for (const [key, rows] of byKey) {
    const forAll = rows.filter((o) => o.level_id === null);
    const teams: ProgramTeam[] = [];
    for (const level of levels) {
      const own = rows.filter((o) => o.level_id === level.id);
      if (own.length) teams.push({ level, status: bestStatus(own), viaAll: false, scored: own.some((o) => o.our_score != null) });
      else if (forAll.length && playing.has(level.id)) teams.push({ level, status: bestStatus(forAll), viaAll: true, scored: false });
    }
    const first = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))[0];
    out.push({
      key,
      name: first.name,
      contact_id: first.contact_id,
      rows,
      all: forAll.some((o) => o.status !== "declined"),
      status: bestStatus(rows),
      teams,
      sort_order: first.sort_order,
    });
  }
  return out.sort(
    (a, b) => statusRank(a.status) - statusRank(b.status) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );
}

// The teams of ours a program plays, coming or a maybe.
export function programTeamIds(p: Pick<WeekendProgram, "teams">): string[] {
  return p.teams.filter((t) => t.status !== "declined").map((t) => t.level.id);
}

// "JV1, JV2?": the teams of ours a program plays, leaving one out (the card's
// own team), with a "?" where it's a maybe. Not coming is left out.
export function teamsLabel(p: Pick<WeekendProgram, "teams">, except?: string): string {
  return p.teams
    .filter((t) => t.level.id !== except && t.status !== "declined")
    .map((t) => `${t.level.label}${t.status === "tentative" ? "?" : ""}`)
    .join(", ");
}

// What tapping one of our teams in a program's chips asks for: the teams it
// plays afterwards. A played game (a score) can't be taken off.
export function toggleProgramTeam(p: Pick<WeekendProgram, "teams">, levelId: string): string[] {
  const on = programTeamIds(p);
  if (!on.includes(levelId)) return [...on, levelId];
  if (p.teams.some((t) => t.level.id === levelId && t.scored)) return on;
  return on.filter((id) => id !== levelId);
}

export interface CellSummary {
  // What the cell shows: the games entered, or nothing.
  count: number | null;
  // Games were entered (a 0 counts).
  entered: boolean;
  // "?" — someone isn't sure yet.
  unsure: boolean;
  confirmed: HsOpponent[];
  tentative: HsOpponent[];
  declined: HsOpponent[];
  // Games with no confirmed opponent named yet.
  tbd: number;
}

export function summarizeCell(games: HsGames | undefined, list: HsOpponent[]): CellSummary {
  const confirmed = list.filter((o) => o.status === "confirmed");
  const tentative = list.filter((o) => o.status === "tentative");
  const declined = list.filter((o) => o.status === "declined");
  const entered = games?.games != null;
  const count = entered ? games!.games! : null;
  return {
    count,
    entered,
    unsure: !!games?.unsure,
    confirmed,
    tentative,
    declined,
    tbd: entered ? Math.max(0, games!.games! - confirmed.length) : 0,
  };
}

// "W 71–40", "L 45–63", "T 50–50"; null when there's no score.
export function resultLabel(o: Pick<HsOpponent, "our_score" | "their_score">): string | null {
  if (o.our_score == null || o.their_score == null) return null;
  const r = o.our_score > o.their_score ? "W" : o.our_score < o.their_score ? "L" : "T";
  return `${r} ${o.our_score}–${o.their_score}`;
}

// ─── Season totals ──────────────────────────────────────────────────────────

export interface LevelTotal {
  levelId: string;
  // Games entered on weekends that count (not off, not canceled).
  games: number;
  // The part of `games` someone marked unsure.
  unsure: number;
  wins: number;
  losses: number;
  ties: number;
}

export function levelTotals(
  levels: Pick<HsLevel, "id">[],
  weekends: Pick<HsWeekend, "id" | "status">[],
  games: HsGames[],
  opponents: HsOpponent[]
): Map<string, LevelTotal> {
  const counting = new Set(weekends.filter(weekendCounts).map((w) => w.id));
  const out = new Map<string, LevelTotal>();
  for (const l of levels) out.set(l.id, { levelId: l.id, games: 0, unsure: 0, wins: 0, losses: 0, ties: 0 });
  for (const g of games) {
    const t = out.get(g.level_id);
    if (!t || !counting.has(g.weekend_id) || g.games == null) continue;
    t.games += g.games;
    if (g.unsure) t.unsure += g.games;
  }
  for (const o of opponents) {
    if (!o.level_id || o.our_score == null || o.their_score == null) continue;
    const t = out.get(o.level_id);
    if (!t || !counting.has(o.weekend_id)) continue;
    if (o.our_score > o.their_score) t.wins++;
    else if (o.our_score < o.their_score) t.losses++;
    else t.ties++;
  }
  return out;
}

export function recordLabel(t: Pick<LevelTotal, "wins" | "losses" | "ties">): string | null {
  if (t.wins + t.losses + t.ties === 0) return null;
  return t.ties ? `${t.wins}–${t.losses}–${t.ties}` : `${t.wins}–${t.losses}`;
}

// ─── Filtering the schedule ─────────────────────────────────────────────────

// The chips above the schedule: a weekend's status, "not sure yet" (one of
// our teams' games has a "?") or "on the fence" (a team coming is a maybe).
export type WeekendFilter = HsWeekendStatus | "unsure" | "fence";

export interface WeekendFacts {
  // One of the shown teams of ours isn't sure of its games.
  unsure: boolean;
  // Teams on the fence: a maybe, and not also a yes that weekend.
  fence: number;
}

export function weekendFacts(
  weekends: Pick<HsWeekend, "id">[],
  games: Pick<HsGames, "weekend_id" | "level_id" | "unsure">[],
  opponents: Pick<HsOpponent, "weekend_id" | "status" | "contact_id" | "name">[],
  levelIds: ReadonlySet<string>
): Map<string, WeekendFacts> {
  const out = new Map<string, WeekendFacts>();
  for (const w of weekends) out.set(w.id, { unsure: false, fence: 0 });
  for (const g of games) {
    const f = out.get(g.weekend_id);
    if (f && g.unsure && levelIds.has(g.level_id)) f.unsure = true;
  }
  const yes = new Map<string, Set<string>>();
  const maybe = new Map<string, Set<string>>();
  for (const o of opponents) {
    const bucket = o.status === "confirmed" ? yes : o.status === "tentative" ? maybe : null;
    if (!bucket) continue;
    const keys = bucket.get(o.weekend_id) ?? new Set<string>();
    keys.add(opponentKey(o));
    bucket.set(o.weekend_id, keys);
  }
  for (const [weekendId, keys] of maybe) {
    const f = out.get(weekendId);
    if (!f) continue;
    const confirmed = yes.get(weekendId);
    f.fence = [...keys].filter((k) => !confirmed?.has(k)).length;
  }
  return out;
}

// Does a weekend match the chips picked? Any one of them is enough; with
// none picked, every weekend shows.
export function matchesWeekendFilters(
  w: Pick<HsWeekend, "id" | "status">,
  filters: ReadonlySet<WeekendFilter>,
  facts: Map<string, WeekendFacts>
): boolean {
  if (filters.size === 0 || filters.has(w.status)) return true;
  const f = facts.get(w.id);
  return !!f && ((filters.has("unsure") && f.unsure) || (filters.has("fence") && f.fence > 0));
}

// How many weekends each chip would show.
export function weekendFilterCounts(
  weekends: Pick<HsWeekend, "id" | "status">[],
  facts: Map<string, WeekendFacts>
): Map<WeekendFilter, number> {
  const out = new Map<WeekendFilter, number>();
  const bump = (k: WeekendFilter) => out.set(k, (out.get(k) ?? 0) + 1);
  for (const w of weekends) {
    bump(w.status);
    const f = facts.get(w.id);
    if (f?.unsure) bump("unsure");
    if (f && f.fence > 0) bump("fence");
  }
  return out;
}

// ─── Starting a season from another ─────────────────────────────────────────

// What "Start 2027–28 from 2026–27" carries over for one weekend, or null to
// leave it out: the same weekend 52 weeks on, the same event and place, as
// planned (off weekends stay off; canceled ones aren't carried).
export function carryWeekend<T extends HsWeekend>(w: T, seasonsApart: number): (Omit<T, "id"> & { id?: never }) | null {
  if (w.status === "canceled") return null;
  const shift = seasonsApart * YEAR_IN_DAYS;
  const { id: _id, ...rest } = w;
  void _id;
  return {
    ...rest,
    starts_on: addDays(w.starts_on, shift),
    ends_on: addDays(w.ends_on, shift),
    status: w.status === "off" ? "off" : "planned",
  } as Omit<T, "id"> & { id?: never };
}
