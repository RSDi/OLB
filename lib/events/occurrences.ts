// Expands recurring events (0062) into concrete dated occurrences for the
// calendar/list views. Events stay single rows in the DB (anchor + weekly
// rule); this computes the instances at read-time, reusing the same weekly
// resolver the request side uses so they agree.
//
// Occurrence instants are derived by whole-day shifting the anchor's start/end
// — preserving wall-clock time and duration without re-deriving timezone.

import { generateWeeklyDates } from "../requests/recurrence";

export interface EventRecurrenceFields {
  start_at: string;
  end_at: string | null;
  recurring?: boolean | null;
  recur_weekdays?: number[] | null;
  recur_until?: string | null;
}

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
// occurrence (their anchor) regardless of window — the caller applies the
// upcoming/past split. Recurring events are bounded to [window.from, window.to].
export function expandEventOccurrences<T extends EventRecurrenceFields>(
  events: T[],
  window: { from: Date; to: Date }
): EventOccurrence<T>[] {
  const out: EventOccurrence<T>[] = [];
  const toDateStr = ymdLocal(window.to);
  const fromDateStr = ymdLocal(window.from);

  for (const ev of events) {
    const weekdays = Array.isArray(ev.recur_weekdays) ? ev.recur_weekdays : [];
    if (!ev.recurring || weekdays.length === 0) {
      out.push({ event: ev, startAt: ev.start_at, endAt: ev.end_at, recurringInstance: false });
      continue;
    }

    const anchor = new Date(ev.start_at);
    const anchorDateStr = ymdLocal(anchor);
    const start = fromDateStr > anchorDateStr ? fromDateStr : anchorDateStr;
    const until = ev.recur_until && ev.recur_until < toDateStr ? ev.recur_until : toDateStr;
    const dates = generateWeeklyDates({ start, weekdays, until });

    const anchorMs = anchor.getTime();
    const endMs = ev.end_at ? new Date(ev.end_at).getTime() : null;
    const anchorDayMs = parseLocalMs(anchorDateStr);

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
