// Date and time display for the Planning page. Everything renders in the
// club's timezone (America/Chicago), NOT the server's, which is UTC on
// Vercel: a 6:00 PM Central practice would otherwise show as 11:00 PM.

import { CHURCH_TZ } from "../../../../lib/dates/today";
import type { MonthKey } from "../../../../lib/planning/season";

// An instant's date in the club's timezone, as "YYYY-MM-DD".
export function churchYmd(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: CHURCH_TZ });
}

export function churchMonthKey(iso: string): MonthKey {
  return churchYmd(iso).slice(0, 7);
}

export function monthShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", timeZone: CHURCH_TZ });
}

export function dayNum(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", timeZone: CHURCH_TZ });
}

export function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ });
}

export function formatTimeRange(startIso: string, endIso: string | null): string {
  const long = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ } as const;
  const startStr = new Date(startIso).toLocaleString("en-US", long);
  if (!endIso) return startStr;
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: CHURCH_TZ });
  const endStr =
    dayKey(startIso) === dayKey(endIso)
      ? timeOnly(endIso)
      : new Date(endIso).toLocaleString("en-US", long);
  return `${startStr} – ${endStr}`;
}

// A plain date ("2026-10-13") as "Tue, Oct 13", built from its parts so it
// never drifts a day across UTC.
export function formatPlainDate(ymd: string, withYear = false): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}
