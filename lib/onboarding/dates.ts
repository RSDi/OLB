// Dates for the registration workflow, in the club's time zone. Plain
// module, pure, safe for client and server.

const ZONE = "America/Chicago";

// "2026-10-11": the day it is in Omaha at `now`.
export function centralDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function utc(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  return new Date(utc(day) + n * 86_400_000).toISOString().slice(0, 10);
}

// Whole days from `a` to `b` (negative when b is earlier).
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

// 0 = Sunday … 6 = Saturday.
export function weekday(day: string): number {
  return new Date(utc(day)).getUTCDay();
}

// The Monday that starts the week holding `day`: one key per week, so a
// weekly email goes once.
export function weekOf(day: string): string {
  const w = weekday(day);
  return addDays(day, w === 0 ? -6 : 1 - w);
}

// "Friday, Jul 26".
export function longDay(day: string): string {
  return new Date(utc(day)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
}

// "Jul 26".
export function shortDay(day: string): string {
  return new Date(utc(day)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}
