// The single source of truth for resolving an event's recurrence rule into
// concrete occurrence dates (YYYY-MM-DD). Pure + dependency-free so it runs the
// same in the calendar expansion, the shutdown-task generator, and the event
// form preview. Supports:
//   - weekly:  recur_weekdays (0=Sun…6=Sat)
//   - monthly: the Nth/last weekday — recur_monthly_week (1-4 or -1) +
//              recur_monthly_weekday (0-6)
//   - recur_until (inclusive end) + recur_except (skip dates)

export interface EventRecurrence {
  start_at: string;
  recurring?: boolean | null;
  recur_freq?: string | null; // 'weekly' | 'monthly'
  recur_weekdays?: number[] | null;
  recur_monthly_week?: number | null; // 1-4, or -1 for "last"
  recur_monthly_weekday?: number | null; // 0=Sun…6=Sat
  recur_until?: string | null; // YYYY-MM-DD
  recur_except?: string[] | null; // YYYY-MM-DD[]
}

export function ymd(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ymdLocal(d: Date): string {
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d); // local midnight; safe for date-only math
}

// Dates matching `weekdays` (0=Sun…6=Sat) in [start, until] inclusive. Bounded
// to ~2 years of scanning so a far-future recur_until can't run away.
function weeklyDates(start: string, weekdays: number[], until: string): string[] {
  if (weekdays.length === 0) return [];
  const end = parseLocal(until);
  const out: string[] = [];
  let cur = parseLocal(start);
  let guard = 0;
  while (cur <= end && guard++ < 750) {
    if (weekdays.includes(cur.getDay())) out.push(ymdLocal(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
}

// The date of the Nth (week=1-4) or last (week=-1) `weekday` in a given month.
// Returns null if that ordinal doesn't exist (e.g. a 5th Sunday).
export function monthlyOccurrence(year: number, month0: number, week: number, weekday: number): string | null {
  if (week === -1) {
    const last = new Date(year, month0 + 1, 0); // last day of month
    const back = (last.getDay() - weekday + 7) % 7;
    return ymd(year, month0, last.getDate() - back);
  }
  const first = new Date(year, month0, 1);
  const fwd = (weekday - first.getDay() + 7) % 7;
  const day = 1 + fwd + (week - 1) * 7;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  return day > daysInMonth ? null : ymd(year, month0, day);
}

// All occurrence dates for an event within [fromStr, toStr] (inclusive),
// honouring recur_until and dropping recur_except. Non-recurring → [].
export function eventOccurrenceDates(ev: EventRecurrence, fromStr: string, toStr: string): string[] {
  if (!ev.recurring) return [];

  const anchorDateStr = ymdLocal(new Date(ev.start_at));
  const start = fromStr > anchorDateStr ? fromStr : anchorDateStr;
  const until = ev.recur_until && ev.recur_until < toStr ? ev.recur_until : toStr;
  if (start > until) return [];

  let dates: string[];
  if (ev.recur_freq === "monthly") {
    const week = ev.recur_monthly_week;
    const weekday = ev.recur_monthly_weekday;
    if (week == null || weekday == null) return [];
    dates = [];
    // Walk each month from `start` to `until`.
    const [sy, sm] = start.split("-").map(Number);
    const [uy, um] = until.split("-").map(Number);
    let y = sy;
    let m = sm - 1; // 0-based
    while (y < uy || (y === uy && m <= um - 1)) {
      const d = monthlyOccurrence(y, m, week, weekday);
      if (d && d >= start && d <= until) dates.push(d);
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
  } else {
    const weekdays = Array.isArray(ev.recur_weekdays) ? ev.recur_weekdays : [];
    if (weekdays.length === 0) return [];
    dates = weeklyDates(start, weekdays, until);
  }

  if (ev.recur_except && ev.recur_except.length > 0) {
    const skip = new Set(ev.recur_except);
    dates = dates.filter((d) => !skip.has(d));
  }
  return dates;
}

const WEEK_LABELS: Record<number, string> = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", [-1]: "Last" };
const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Human summary, e.g. "Last Sunday of the month" or "Weekly on Sun, Wed".
export function recurrenceSummary(ev: EventRecurrence): string | null {
  if (!ev.recurring) return null;
  if (ev.recur_freq === "monthly") {
    if (ev.recur_monthly_week == null || ev.recur_monthly_weekday == null) return "Monthly";
    return `${WEEK_LABELS[ev.recur_monthly_week] ?? ""} ${WEEKDAY_LABELS[ev.recur_monthly_weekday]} of the month`.trim();
  }
  const wd = Array.isArray(ev.recur_weekdays) ? ev.recur_weekdays : [];
  if (wd.length === 0) return "Weekly";
  const short = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `Weekly on ${wd.slice().sort((a, b) => a - b).map((d) => short[d]).join(", ")}`;
}
