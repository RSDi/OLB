// Tournaments we host (0134): the checklist a new plan starts with, brackets
// and round robins, filling the courts, the money, and the program email.
// Pure and safe to import from client components; tested in
// tests/unit/hosted.test.ts.

import type {
  HostedDay,
  HostedDivision,
  HostedGame,
  HostedMoney,
  HostedPlan,
  HostedStep,
  HostedTeam,
  MoneyCategory,
  MoneyKind,
  StepSection,
} from "./types.ts"; // explicit extension so node --test can load this file

// ─── The checklist ──────────────────────────────────────────────────────────

// What every tournament we host needs, the way the board walks it. A new
// plan starts with these; each can be renamed, dated, ticked or removed.
export const DEFAULT_STEPS: { section: StepSection; label: string }[] = [
  { section: "facility", label: "Facility secured for our dates" },
  { section: "facility", label: "Walk-through of the facility" },
  { section: "facility", label: "Point of contact at the facility for the weekend" },
  { section: "facility", label: "Pricing from the facility" },
  { section: "facility", label: "Certificate of insurance" },
  { section: "facility", label: "Contract signed" },
  { section: "teams", label: "Invite programs" },
  { section: "teams", label: "Attending programs and divisions confirmed" },
  { section: "teams", label: "Team fees collected" },
  { section: "officials", label: "Referees booked" },
  { section: "officials", label: "Scorekeepers and clock for every court" },
  { section: "communication", label: "Program communication sent" },
  { section: "communication", label: "Final schedule and brackets sent" },
  { section: "game_day", label: "Admission table and passes" },
  { section: "game_day", label: "Concessions confirmed" },
  { section: "game_day", label: "Sponsor banners and program ads" },
  { section: "game_day", label: "Set-up and tear-down crew" },
];

export function stepProgress(steps: Pick<HostedStep, "done_on">[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done_on).length, total: steps.length };
}

// Steps past their due date and not done, for the tile at the top.
export function overdueSteps<S extends Pick<HostedStep, "done_on" | "due_on">>(steps: S[], today: string): S[] {
  return steps.filter((s) => !s.done_on && s.due_on && s.due_on < today);
}

// ─── Days and times ─────────────────────────────────────────────────────────

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// "14:00" → 840. Null when it isn't a time.
export function toMinutes(t: string | null | undefined): number | null {
  const m = t ? HHMM.exec(t.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 840 → "14:00".
export function fromMinutes(n: number): string {
  const h = Math.floor(n / 60) % 24;
  const m = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// "14:00" → "2:00 PM".
export function formatTime(t: string | null | undefined): string {
  const n = toMinutes(t);
  if (n == null) return "";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const DAY = 86_400_000;

function addDays(ymd: string, n: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

// "2026-11-13" → "Friday, Nov 13".
export function formatDay(ymd: string, opts: { short?: boolean } = {}): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: opts.short ? "short" : "long",
    month: "short",
    day: "numeric",
  });
}

// The tournament's days as the weekend spans them, keeping the times already
// set for a day still in it. A new day starts at 8 AM, the first at 5 PM
// (Friday night), and runs to 9:30 PM.
export function daysForWeekend(starts_on: string, ends_on: string, have: HostedDay[]): HostedDay[] {
  const out: HostedDay[] = [];
  for (let d = starts_on, i = 0; d <= ends_on && i < 15; d = addDays(d, 1), i++) {
    const kept = have.find((h) => h.date === d);
    out.push(kept ?? { date: d, start: i === 0 && starts_on < ends_on ? "17:00" : "08:00", end: "21:30" });
  }
  return out;
}

// Clean the days a form sends: real dates and times, each closing after it
// opens, in order, no repeats. Null when one doesn't make sense.
export function cleanDays(days: unknown): HostedDay[] | { error: string } {
  if (!Array.isArray(days)) return [];
  const out: HostedDay[] = [];
  for (const d of days.slice(0, 15)) {
    const date = typeof d?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null;
    const start = toMinutes(d?.start);
    const end = toMinutes(d?.end);
    if (!date || start == null || end == null) return { error: "Each day needs a first game time and a closing time." };
    if (end <= start) return { error: `${formatDay(date)} closes before it opens.` };
    if (!out.some((o) => o.date === date)) out.push({ date, start: fromMinutes(start), end: fromMinutes(end) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Slot {
  date: string;
  start: number; // minutes into the day
  court: number; // 1…courts
}

// Every game slot: each day from its first game, a game length apart, while
// a game still ends by closing; every court in each.
export function slotsFor(days: HostedDay[], gameMinutes: number, courts: number): Slot[] {
  const out: Slot[] = [];
  const len = Math.max(1, gameMinutes);
  for (const d of days) {
    const open = toMinutes(d.start);
    const close = toMinutes(d.end);
    if (open == null || close == null) continue;
    for (let t = open; t + len <= close; t += len) {
      for (let c = 1; c <= courts; c++) out.push({ date: d.date, start: t, court: c });
    }
  }
  return out;
}

// ─── Brackets and pools ─────────────────────────────────────────────────────

// Where a side of a game comes from: a seed (0-based, into the division's
// teams by seed), the winner or loser of an earlier game, or nobody (a bye).
export type Side = { seed: number } | { from: "W" | "L"; game: number } | { bye: true };

export interface PlannedGame {
  // The game's index in the list (what { from, game } points at).
  index: number;
  round: number;
  home: Side;
  away: Side;
  // In a bracket's last round, the places it decides: [1, 2] is the final.
  places: [number, number] | null;
}

// Bracket order for `size` slots (a power of two): 1 v 8, 4 v 5, 2 v 7, 3 v 6,
// so the top two seeds can only meet in the final.
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const isBye = (s: Side) => "bye" in s;

// A placement bracket, the way the JV bracket sheet does it: every team plays
// every round, winners on to play winners and losers to play losers, so every
// place is decided (eight teams: 12 games over three rounds, Game 9 for first
// and second). A team count short of a power of two gets byes, top seeds
// first; a game against a bye isn't played, and the team just moves on.
export function placementBracket(teams: number): PlannedGame[] {
  if (teams < 2) return [];
  let size = 2;
  while (size < teams) size *= 2;
  const first: Side[] = seedOrder(size).map((s) => (s <= teams ? { seed: s - 1 } : { bye: true }));
  const games: PlannedGame[] = [];

  // One group of sides playing for places offset+1 … offset+sides.length.
  type Group = { sides: Side[]; offset: number };
  let groups: Group[] = [{ sides: first, offset: 0 }];
  for (let round = 1; groups.some((g) => g.sides.length > 1); round++) {
    const next: Group[] = [];
    const winners: Group[] = [];
    const losers: Group[] = [];
    for (const g of groups) {
      const w: Side[] = [];
      const l: Side[] = [];
      for (let i = 0; i < g.sides.length; i += 2) {
        const [a, b] = [g.sides[i], g.sides[i + 1]];
        if (isBye(a) || isBye(b)) {
          w.push(isBye(a) ? b : a);
          l.push({ bye: true });
          continue;
        }
        const index = games.length;
        games.push({
          index,
          round,
          home: a,
          away: b,
          places: g.sides.length === 2 ? [g.offset + 1, g.offset + 2] : null,
        });
        w.push({ from: "W", game: index });
        l.push({ from: "L", game: index });
      }
      if (g.sides.length > 2) {
        winners.push({ sides: w, offset: g.offset });
        losers.push({ sides: l, offset: g.offset + g.sides.length / 2 });
      }
    }
    // The games for the top places first in each round, like the sheet.
    next.push(...winners, ...losers);
    groups = next.sort((a, b) => a.offset - b.offset);
  }
  return games;
}

// A round robin (the circle method): everyone plays everyone once, in
// rounds where nobody plays twice.
export function roundRobin(teams: number): PlannedGame[] {
  if (teams < 2) return [];
  const slots = teams % 2 ? [...Array(teams).keys(), -1] : [...Array(teams).keys()];
  const n = slots.length;
  const games: PlannedGame[] = [];
  let ring = slots.slice(1);
  for (let round = 1; round < n; round++) {
    const line = [slots[0], ...ring];
    for (let i = 0; i < n / 2; i++) {
      const a = line[i];
      const b = line[n - 1 - i];
      if (a < 0 || b < 0) continue;
      games.push({ index: games.length, round, home: { seed: a }, away: { seed: b }, places: null });
    }
    ring = [ring[ring.length - 1], ...ring.slice(0, -1)];
  }
  return games;
}

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth"];

export function placesLabel(places: [number, number]): string {
  const name = (n: number) => ORDINAL[n - 1] ?? `${n}th`;
  return `${name(places[0])}, ${name(places[1])}`;
}

// A division's teams in seed order: by seed, then the order they were added.
export function seeded<T extends Pick<HostedTeam, "seed" | "sort_order" | "name">>(teams: T[]): T[] {
  return [...teams].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

// ─── Filling the courts ─────────────────────────────────────────────────────

// Puts each game without a time into the earliest open slot, in order of
// round then game number, so that no team plays two games at once, and a
// bracket game comes after the games that feed it. A team gets a game's
// rest between its games (`rest`, a slot by default) when there's still a
// slot for that; otherwise back to back. Games already placed stay where
// they are. Returns the times for the games it placed, and the ones it
// couldn't fit.
export function fillCourts(
  games: HostedGame[],
  slots: Slot[],
  gameMinutes: number,
  rest = gameMinutes
): { placed: { id: string; plays_on: string; starts_at: string; court: number }[]; unplaced: string[] } {
  const len = Math.max(1, gameMinutes);
  const at = (date: string, start: number) => Date.parse(`${date}T00:00:00Z`) / 60_000 + start;
  const taken = new Set<string>();
  const ends = new Map<string, number>(); // game id → when it ends
  const busy = new Map<string, number[]>(); // team id → start times
  const feeders = (g: HostedGame) => [g.home_from, g.away_from].filter((x): x is string => !!x).map((f) => f.slice(2));
  const teamsOf = (g: HostedGame) => [g.home_team_id, g.away_team_id].filter((x): x is string => !!x);
  const book = (g: HostedGame, date: string, start: number, court: number) => {
    taken.add(`${date}|${start}|${court}`);
    const t = at(date, start);
    ends.set(g.id, t + len);
    for (const team of teamsOf(g)) busy.set(team, [...(busy.get(team) ?? []), t]);
  };
  for (const g of games) {
    const start = toMinutes(g.starts_at);
    if (g.plays_on && start != null && g.court) book(g, g.plays_on, start, g.court);
  }
  const todo = games
    .filter((g) => !(g.plays_on && toMinutes(g.starts_at) != null && g.court))
    .sort((a, b) => a.round - b.round || a.game_no - b.game_no);
  const placed: { id: string; plays_on: string; starts_at: string; court: number }[] = [];
  const unplaced: string[] = [];
  const ordered = [...slots].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.court - b.court);
  for (const g of todo) {
    // A game fed by one that couldn't be placed can't be either.
    const feed = feeders(g);
    if (feed.some((f) => games.some((x) => x.id === f) && !ends.has(f))) {
      unplaced.push(g.id);
      continue;
    }
    const fits = (gap: number) => (s: Slot) => {
      if (taken.has(`${s.date}|${s.start}|${s.court}`)) return false;
      const t = at(s.date, s.start);
      if (t < Math.max(0, ...feed.map((f) => (ends.get(f) ?? 0) + gap))) return false;
      return teamsOf(g).every((team) => (busy.get(team) ?? []).every((b) => t >= b + len + gap || t + len + gap <= b));
    };
    const slot = ordered.find(fits(Math.max(0, rest))) ?? ordered.find(fits(0));
    if (!slot) {
      unplaced.push(g.id);
      continue;
    }
    book(g, slot.date, slot.start, slot.court);
    placed.push({ id: g.id, plays_on: slot.date, starts_at: fromMinutes(slot.start), court: slot.court });
  }
  return { placed, unplaced };
}

// ─── Naming games ───────────────────────────────────────────────────────────

export function teamLabel(t: Pick<HostedTeam, "code" | "name"> | undefined): string {
  return t ? t.code || t.name : "TBD";
}

// One side of a game: the team, or "Winner Game 1" until it's known.
export function sideLabel(
  teamId: string | null,
  from: string | null,
  teams: Map<string, HostedTeam>,
  games: Map<string, HostedGame>
): string {
  if (teamId) return teamLabel(teams.get(teamId));
  if (from) {
    const g = games.get(from.slice(2));
    return `${from[0] === "W" ? "Winner" : "Loser"} Game ${g?.game_no ?? "?"}`;
  }
  return "TBD";
}

// "HSA (OL 1 vs KCM 1)", the way the facility schedule writes a game.
export function gameLine(
  g: HostedGame,
  divisions: Map<string, HostedDivision>,
  teams: Map<string, HostedTeam>,
  games: Map<string, HostedGame>
): string {
  const d = g.division_id ? divisions.get(g.division_id) : undefined;
  const who = `${sideLabel(g.home_team_id, g.home_from, teams, games)} vs ${sideLabel(g.away_team_id, g.away_from, teams, games)}`;
  return d ? `${d.code || d.name} (${who})` : who;
}

// When a bracket game has a score, who moves on: the winner and loser of
// each finished game, to fill the games they feed.
export function advance(games: HostedGame[]): { id: string; home_team_id: string | null; away_team_id: string | null }[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  const result = (from: string | null): string | null | undefined => {
    if (!from) return undefined;
    const g = byId.get(from.slice(2));
    if (!g || g.home_score == null || g.away_score == null || g.home_score === g.away_score) return null;
    if (!g.home_team_id || !g.away_team_id) return null;
    const homeWon = g.home_score > g.away_score;
    return from[0] === "W" ? (homeWon ? g.home_team_id : g.away_team_id) : homeWon ? g.away_team_id : g.home_team_id;
  };
  const out: { id: string; home_team_id: string | null; away_team_id: string | null }[] = [];
  for (const g of games) {
    if (!g.home_from && !g.away_from) continue;
    const home = g.home_from ? (result(g.home_from) ?? null) : g.home_team_id;
    const away = g.away_from ? (result(g.away_from) ?? null) : g.away_team_id;
    if (home !== g.home_team_id || away !== g.away_team_id) out.push({ id: g.id, home_team_id: home, away_team_id: away });
  }
  return out;
}

// ─── Money ──────────────────────────────────────────────────────────────────

// What a team pays: its own fee, else nothing for one of ours, else the
// tournament's team fee.
export function teamFee(t: Pick<HostedTeam, "fee_cents" | "ours">, defaultFee: number | null): number {
  if (t.fee_cents != null) return t.fee_cents;
  return t.ours ? 0 : (defaultFee ?? 0);
}

// A line's count: what it says, or for a referee line that follows a
// division, that division's games (every division's when it names none).
export function lineCount(m: Pick<HostedMoney, "qty" | "division_id" | "category">, games: Pick<HostedGame, "division_id">[]): number {
  if (m.qty != null) return Number(m.qty);
  if (m.category !== "referee") return 0;
  return games.filter((g) => !m.division_id || g.division_id === m.division_id).length;
}

export function lineTotal(m: Pick<HostedMoney, "qty" | "division_id" | "category" | "unit_cents">, games: Pick<HostedGame, "division_id">[]): number {
  return Math.round(lineCount(m, games) * m.unit_cents);
}

export interface MoneySummary {
  teamFees: number;
  teamsPaying: number;
  byCategory: { kind: MoneyKind; category: MoneyCategory; total: number }[];
  revenue: number;
  expense: number;
  net: number;
}

export function moneySummary(plan: Pick<HostedPlan, "team_fee_cents">, teams: HostedTeam[], money: HostedMoney[], games: HostedGame[]): MoneySummary {
  const fees = teams.map((t) => teamFee(t, plan.team_fee_cents));
  const teamFees = fees.reduce((n, f) => n + f, 0);
  const byCategory: MoneySummary["byCategory"] = [];
  for (const m of money) {
    const total = lineTotal(m, games);
    const row = byCategory.find((r) => r.kind === m.kind && r.category === m.category);
    if (row) row.total += total;
    else byCategory.push({ kind: m.kind, category: m.category, total });
  }
  const sum = (k: MoneyKind) => byCategory.filter((r) => r.kind === k).reduce((n, r) => n + r.total, 0);
  const revenue = teamFees + sum("revenue");
  const expense = sum("expense");
  return { teamFees, teamsPaying: fees.filter((f) => f > 0).length, byCategory, revenue, expense, net: revenue - expense };
}

// "45", "2.5", "" → a count; null when it isn't one.
export function parseCount(raw: string): number | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : undefined;
}

// ─── The program communication ──────────────────────────────────────────────

const money = (cents: number) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toFixed(2)}`);

// The email to the programs coming, from the plan, the way the spreadsheet's
// "Program Communication" tab reads: who's coming, the divisions, where,
// concessions, the rules, and the court schedule. Everyone gets the same
// text; edit it before sending.
export function programMessage(input: {
  title: string;
  dates: string;
  facilityName: string | null;
  plan: HostedPlan;
  divisions: HostedDivision[];
  teams: HostedTeam[];
  games: HostedGame[];
  programs: { name: string; status: string }[];
}): { subject: string; body: string } {
  const { plan, divisions, teams, games } = input;
  const out: string[] = [];
  out.push(`Thanks for coming to the ${input.title}, ${input.dates}! Here's what to know.`);

  const coming = input.programs.filter((p) => p.status === "confirmed").map((p) => p.name);
  if (coming.length) out.push(`ATTENDING PROGRAMS\n${coming.join("\n")}`);

  const divs = divisions
    .map((d) => {
      const mine = seeded(teams.filter((t) => t.division_id === d.id));
      return mine.length ? `${d.name}: ${mine.map((t) => t.name + (t.code ? ` (${t.code})` : "")).join(", ")}` : null;
    })
    .filter(Boolean);
  if (divs.length) out.push(`DIVISIONS\n${divs.join("\n")}`);

  const where = [input.facilityName, plan.facility].filter(Boolean).join("\n");
  if (where) out.push(`FACILITY LOCATION\n${where}`);
  if (plan.concessions) out.push(`CONCESSIONS\n${plan.concessions}`);
  if (plan.admission) out.push(`ADMISSION\n${plan.admission}`);
  if (plan.rules) out.push(`GAME INFORMATION / RULES\n${plan.rules}`);

  const timed = games.filter((g) => g.plays_on && g.starts_at && g.court);
  if (timed.length) {
    const dMap = new Map(divisions.map((d) => [d.id, d]));
    const tMap = new Map(teams.map((t) => [t.id, t]));
    const gMap = new Map(games.map((g) => [g.id, g]));
    const lines: string[] = [];
    for (const day of [...new Set(timed.map((g) => g.plays_on!))].sort()) {
      lines.push(`${formatDay(day)}`);
      const ofDay = timed
        .filter((g) => g.plays_on === day)
        .sort((a, b) => (toMinutes(a.starts_at) ?? 0) - (toMinutes(b.starts_at) ?? 0) || (a.court ?? 0) - (b.court ?? 0));
      for (const g of ofDay) lines.push(`  ${formatTime(g.starts_at)}  Court ${g.court}  Game ${g.game_no}: ${gameLine(g, dMap, tMap, gMap)}`);
    }
    out.push(`GAME / COURT SCHEDULE\n${lines.join("\n")}`);
  }
  const fee = plan.team_fee_cents;
  if (fee) out.push(`TEAM FEE\n${money(fee)} per team.`);
  out.push("Questions? Just reply to this email.");
  return { subject: `${input.title}: ${input.dates}`, body: out.join("\n\n") };
}

// "Missouri River Shootout" → "MRS".
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 8);
}
