// Expands recurring events into concrete dated occurrences for the calendar/
// list views. Date resolution lives in lib/events/recurrence.ts (shared with
// the shutdown generator); here each date gets the event's Central wall-clock
// start time and its duration. Everything is worked out in the club's timezone
// (lib/dates/zoned.ts), not the server's: stepping the first start forward in
// whole UTC days turned a 6:00 PM practice into 5:00 PM once daylight saving
// ended, and put evening events (already tomorrow in UTC) on the day before.

import { eventOccurrenceDates, type EventRecurrence } from "./recurrence.ts"; // explicit extension so node --test can load this file
import { zonedParts, zonedTimeToUtc } from "../dates/zoned.ts";

export type EventRecurrenceFields = EventRecurrence & {
  end_at: string | null;
};

export interface EventOccurrence<T> {
  event: T;
  startAt: string; // ISO
  endAt: string | null; // ISO
  recurringInstance: boolean;
}

// Expand events into occurrences. Non-recurring events pass through as a single
// occurrence (their anchor); the caller applies the upcoming/past split.
// Recurring events are bounded to the Central dates of [window.from, window.to].
export function expandEventOccurrences<T extends EventRecurrenceFields>(
  events: T[],
  window: { from: Date; to: Date }
): EventOccurrence<T>[] {
  const out: EventOccurrence<T>[] = [];
  const fromStr = zonedParts(window.from).ymd;
  const toStr = zonedParts(window.to).ymd;

  for (const ev of events) {
    if (!ev.recurring) {
      out.push({ event: ev, startAt: ev.start_at, endAt: ev.end_at, recurringInstance: false });
      continue;
    }

    const anchor = new Date(ev.start_at);
    const wall = zonedParts(anchor);
    const durationMs = ev.end_at ? new Date(ev.end_at).getTime() - anchor.getTime() : null;

    for (const ds of eventOccurrenceDates(ev, fromStr, toStr)) {
      const start = zonedTimeToUtc(ds, wall);
      out.push({
        event: ev,
        startAt: start.toISOString(),
        endAt: durationMs != null ? new Date(start.getTime() + durationMs).toISOString() : null,
        recurringInstance: true,
      });
    }
  }
  return out;
}
