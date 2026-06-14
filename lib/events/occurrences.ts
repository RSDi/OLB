// Expands recurring events into concrete dated occurrences for the calendar/
// list views. Date resolution lives in lib/events/recurrence.ts (shared with
// the shutdown generator); here we just turn each date into a start/end instant
// by whole-day-shifting the anchor — preserving wall-clock time and duration.

import { eventOccurrenceDates, type EventRecurrence } from "./recurrence";

export type EventRecurrenceFields = EventRecurrence & {
  end_at: string | null;
};

export interface EventOccurrence<T> {
  event: T;
  startAt: string; // ISO
  endAt: string | null; // ISO
  recurringInstance: boolean;
}

const DAY_MS = 86400000;

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

// Expand events into occurrences. Non-recurring events pass through as a single
// occurrence (their anchor); the caller applies the upcoming/past split.
// Recurring events are bounded to [window.from, window.to].
export function expandEventOccurrences<T extends EventRecurrenceFields>(
  events: T[],
  window: { from: Date; to: Date }
): EventOccurrence<T>[] {
  const out: EventOccurrence<T>[] = [];
  const fromStr = ymdLocal(window.from);
  const toStr = ymdLocal(window.to);

  for (const ev of events) {
    if (!ev.recurring) {
      out.push({ event: ev, startAt: ev.start_at, endAt: ev.end_at, recurringInstance: false });
      continue;
    }

    const dates = eventOccurrenceDates(ev, fromStr, toStr);
    const anchor = new Date(ev.start_at);
    const anchorMs = anchor.getTime();
    const anchorDayMs = parseLocalMs(ymdLocal(anchor));
    const endMs = ev.end_at ? new Date(ev.end_at).getTime() : null;

    for (const ds of dates) {
      const diffDays = Math.round((parseLocalMs(ds) - anchorDayMs) / DAY_MS);
      const shift = diffDays * DAY_MS;
      out.push({
        event: ev,
        startAt: new Date(anchorMs + shift).toISOString(),
        endAt: endMs != null ? new Date(endMs + shift).toISOString() : null,
        recurringInstance: true,
      });
    }
  }
  return out;
}
