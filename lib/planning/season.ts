// Planning runs on the club's season, August through July, the way the
// President/AD timeline reads. A season is named by the year it starts:
// 2026 is the 2026–27 season.
//
// Months are "YYYY-MM" strings (MonthKey), so ordering is plain string
// comparison, like the YYYY-MM-DD dates in lib/dates/today.ts. Pure; safe to
// import from client components.

export const SEASON_START_MONTH = 8; // August

export type MonthKey = string;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function isMonthKey(s: string | null | undefined): s is MonthKey {
  return !!s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function parts(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

function keyOf(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// "2026-09-30" (or any ISO date/datetime) → "2026-09".
export function monthKeyOf(ymd: string): MonthKey {
  return ymd.slice(0, 7);
}

export function monthNumber(key: MonthKey): number {
  return parts(key).month;
}

export function addMonths(key: MonthKey, n: number): MonthKey {
  const { year, month } = parts(key);
  const i = year * 12 + (month - 1) + n;
  return keyOf(Math.floor(i / 12), (i % 12) + 1);
}

// Every month from `from` to `to`, both included, oldest first.
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}

export function seasonOfMonth(key: MonthKey): number {
  const { year, month } = parts(key);
  return month >= SEASON_START_MONTH ? year : year - 1;
}

export function seasonOf(ymd: string): number {
  return seasonOfMonth(monthKeyOf(ymd));
}

// 2026 → "2026–27".
export function seasonLabel(season: number): string {
  return `${season}–${String((season + 1) % 100).padStart(2, "0")}`;
}

// A template month (1–12) in a given season: August–December fall in the
// season's first year, January–July in the next.
export function seasonMonth(season: number, month: number): MonthKey {
  return keyOf(month >= SEASON_START_MONTH ? season : season + 1, month);
}

// The season's twelve months, August first.
export function seasonMonths(season: number): MonthKey[] {
  const first = seasonMonth(season, SEASON_START_MONTH);
  return monthsBetween(first, addMonths(first, 11));
}

export function firstDayOf(key: MonthKey): string {
  return `${key}-01`;
}

export function lastDayOf(key: MonthKey): string {
  const { year, month } = parts(key);
  // Day 0 of the next month is this month's last day. UTC, so no DST drift.
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${String(day).padStart(2, "0")}`;
}

// 1 → "January", or "Jan" when short.
export function monthName(month: number, short = false): string {
  const name = MONTH_NAMES[month - 1] ?? "";
  return short ? name.slice(0, 3) : name;
}

// "2026-10" → "October 2026".
export function monthLabel(key: MonthKey): string {
  const { year, month } = parts(key);
  return `${monthName(month)} ${year}`;
}

// How a month reads from where we are: "This month", "Next month", "Last
// month", or null for anything further away.
export function relativeMonth(key: MonthKey, current: MonthKey): string | null {
  if (key === current) return "This month";
  if (key === addMonths(current, 1)) return "Next month";
  if (key === addMonths(current, -1)) return "Last month";
  return null;
}
