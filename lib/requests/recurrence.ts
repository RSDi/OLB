// Resolves a request's recurrence inputs into a concrete, sorted list of dates
// (YYYY-MM-DD). Pure + dependency-free so it's unit-testable and so the wizard
// preview, createRequest (which stores the canonical details.dates), the
// conflict checker, and the approval calendar-booker all agree.
//
// Recurrence model (captured by the wizard):
//   date           — the first/anchor occurrence (always included unless excluded)
//   recurring      — boolean
//   recurWeekdays  — number[] 0=Sun…6=Sat: which weekdays repeat
//   recurUntil     — YYYY-MM-DD inclusive end of the weekly run
//   recurExtras    — string[] one-off dates the member added
//   recurExcludes  — string[] generated dates the member removed (e.g. a holiday)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight; safe for date-only math
}
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function generateWeeklyDates(opts: {
  start: string;
  weekdays: number[];
  until: string | null;
  maxDays?: number; // safety bound on the range scanned
}): string[] {
  // ~2 years of daily scanning — comfortably covers any realistic church
  // booking series while still bounding a runaway/far-future recurUntil.
  const { start, weekdays, until, maxDays = 750 } = opts;
  if (!DATE_RE.test(start) || !until || !DATE_RE.test(until) || weekdays.length === 0) return [];
  const end = parseLocal(until);
  const out: string[] = [];
  let cur = parseLocal(start);
  let guard = 0;
  while (cur <= end && guard++ < maxDays) {
    if (weekdays.includes(cur.getDay())) out.push(fmtLocal(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

interface RecurrenceDetails {
  date?: unknown;
  recurring?: unknown;
  recurWeekdays?: unknown;
  recurUntil?: unknown;
  recurExtras?: unknown;
  recurExcludes?: unknown;
}

// The authoritative date list for a request. Non-recurring → just [date].
// Recurring → anchor + weekly matches + extras − excludes, sorted & unique.
export function resolveRequestDates(d: RecurrenceDetails | null | undefined): string[] {
  if (!d) return [];
  const date = typeof d.date === "string" && DATE_RE.test(d.date) ? d.date : null;
  if (!d.recurring) return date ? [date] : [];

  const weekdays = Array.isArray(d.recurWeekdays)
    ? (d.recurWeekdays as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];
  const until = typeof d.recurUntil === "string" && DATE_RE.test(d.recurUntil) ? d.recurUntil : null;
  const extras = Array.isArray(d.recurExtras) ? (d.recurExtras as unknown[]).filter((x): x is string => typeof x === "string" && DATE_RE.test(x)) : [];
  const excludes = new Set(
    Array.isArray(d.recurExcludes) ? (d.recurExcludes as unknown[]).filter((x): x is string => typeof x === "string") : [],
  );

  const set = new Set<string>();
  if (date) set.add(date); // anchor occurrence
  for (const g of date ? generateWeeklyDates({ start: date, weekdays, until }) : []) set.add(g);
  for (const e of extras) set.add(e);
  for (const x of excludes) set.delete(x);
  return [...set].sort();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-01-06" → "Jan 6". Falls back to the raw string if it isn't YYYY-MM-DD.
export function formatDateLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

// Compact human label for a date list: "Jan 6 – Mar 31 · 8 dates" (or a single
// date). Used in the description + review card.
export function summarizeDates(dates: string[]): string {
  if (dates.length === 0) return "";
  if (dates.length === 1) return formatDateLabel(dates[0]);
  const sorted = [...dates].sort();
  return `${formatDateLabel(sorted[0])} – ${formatDateLabel(sorted[sorted.length - 1])} · ${sorted.length} dates`;
}

// A single booked day with its time window. The authoritative unit the conflict
// checker and the calendar booker both act on, so they agree about per-day
// hours.
export interface Occurrence {
  date: string; // YYYY-MM-DD
  start: string | null; // HH:MM
  end: string | null; // HH:MM
}

function timeStr(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// Each occurrence of a request with its time window. Same hours for every date
// unless the member chose per-day hours (sameHours === false), in which case
// dayHours[date] overrides — falling back to the default window for any day not
// given its own. resolveRequestDates is the date source of truth.
export function resolveOccurrences(d: (RecurrenceDetails & {
  startTime?: unknown;
  endTime?: unknown;
  sameHours?: unknown;
  dayHours?: unknown;
}) | null | undefined): Occurrence[] {
  if (!d) return [];
  const dates = resolveRequestDates(d);
  const defStart = timeStr(d.startTime);
  const defEnd = timeStr(d.endTime);
  const perDay =
    d.sameHours === false && d.dayHours && typeof d.dayHours === "object"
      ? (d.dayHours as Record<string, { start?: unknown; end?: unknown }>)
      : null;
  return dates.map((date) => {
    const o = perDay ? perDay[date] : undefined;
    return {
      date,
      start: o ? timeStr(o.start) ?? defStart : defStart,
      end: o ? timeStr(o.end) ?? defEnd : defEnd,
    };
  });
}
