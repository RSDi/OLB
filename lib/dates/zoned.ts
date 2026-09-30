// Wall-clock time in the club's timezone (America/Chicago), independent of
// the timezone the code runs in: the server is UTC on Vercel, and a browser
// can be anywhere. Used to repeat an event at the same Central time on every
// date, across daylight-saving changes (lib/events/occurrences.ts).
//
// Pure, no dependencies; safe to import from client components.

import { CHURCH_TZ } from "./today.ts"; // explicit extension so node --test can load this file

export interface ZonedParts {
  ymd: string; // "YYYY-MM-DD"
  hour: number; // 0-23
  minute: number;
  second: number;
  millisecond: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

// What a clock in `tz` reads at this instant.
export function zonedParts(date: Date, tz: string = CHURCH_TZ): ZonedParts {
  const p: Record<string, string> = {};
  for (const part of formatter(tz).formatToParts(date)) p[part.type] = part.value;
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    millisecond: date.getUTCMilliseconds(),
  };
}

// How far `tz`'s clock is ahead of UTC at this instant, in ms (negative for
// Central: -5 h in summer, -6 h in winter).
function offsetMs(instant: number, tz: string): number {
  const p = zonedParts(new Date(instant), tz);
  const [y, m, d] = p.ymd.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, p.hour, p.minute, p.second, p.millisecond);
  return asUtc - instant;
}

// The instant a clock in `tz` reads `ymd` at the given time. A time the clock
// skips (2:30 AM on the spring-forward night) lands an hour later, as a clock
// would show it.
export function zonedTimeToUtc(
  ymd: string,
  time: { hour: number; minute: number; second?: number; millisecond?: number },
  tz: string = CHURCH_TZ,
): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, time.hour, time.minute, time.second ?? 0, time.millisecond ?? 0);
  // Guess with the offset at the wall time read as UTC, then correct once for
  // the offset at the guess (they differ only near a DST change).
  const first = wall - offsetMs(wall, tz);
  const second = wall - offsetMs(first, tz);
  if (second === first) return new Date(first);
  // In the spring-forward gap neither guess reads back as the wall time; take
  // the later instant (the time after the jump).
  return new Date(Math.max(first, second));
}

// An instant as the "YYYY-MM-DDTHH:mm" value a date-time field holds
// (<input type="datetime-local">, DateTimePicker), on the clock in `tz`. The
// field has no timezone, so this can't use the server's clock (UTC on Vercel)
// or the browser's.
export function toZonedDatetimeLocal(date: Date, tz: string = CHURCH_TZ): string {
  const p = zonedParts(date, tz);
  return `${p.ymd}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

// The instant a date-time field's "YYYY-MM-DDTHH:mm" value means on the clock
// in `tz`.
export function fromZonedDatetimeLocal(value: string, tz: string = CHURCH_TZ): Date {
  const [ymd, time = ""] = value.split("T");
  const [hour, minute] = time.split(":").map(Number);
  return zonedTimeToUtc(ymd, { hour, minute }, tz);
}
