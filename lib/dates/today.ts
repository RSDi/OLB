// Task scheduling uses plain `date` columns (start_on, due_on) with no time or
// timezone. "Today" must therefore be the church's LOCAL day, not the server's
// UTC day — otherwise a task scheduled for today flips to Upcoming/overdue
// around midnight UTC. The server runs in UTC (Vercel), so we resolve the local
// date explicitly.
//
// All scheduling comparisons are done on `YYYY-MM-DD` strings, where
// lexicographic order == chronological order. NEVER compare via
// `new Date(due_on) < new Date()` — that injects time-of-day + UTC parsing bugs.

// Millard Community Church is in Omaha, NE (Central Time).
export const CHURCH_TZ = "America/Chicago";

// Today's date in the church's timezone, as "YYYY-MM-DD". `en-CA` formats as
// ISO (YYYY-MM-DD), which is exactly the shape Postgres `date` columns return.
export function churchToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TZ }).format(new Date());
}

// Convenience predicates over ISO date strings ("YYYY-MM-DD"). A null date is
// never overdue / future.
export function isOverdue(due: string | null, today: string): boolean {
  return !!due && due < today;
}

export function isFuture(date: string | null, today: string): boolean {
  return !!date && date > today;
}

// Format an ISO date ("YYYY-MM-DD") as e.g. "Jun 22" without any timezone shift
// (build the Date from parts so date-only values don't drift across UTC).
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
