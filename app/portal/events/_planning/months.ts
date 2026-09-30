// Builds the Planning calendar's months: each month's board meeting, kept
// tasks, one-off events, and repeating events folded into one line per
// series (a weekly practice would otherwise be a dozen rows a month).

import type { SupabaseClient } from "@supabase/supabase-js";
import { expandEventOccurrences, type EventOccurrence } from "../../../../lib/events/occurrences";
import { addMonths, firstDayOf, lastDayOf, type MonthKey } from "../../../../lib/planning/season";
import type { PlanningMeeting, PlanningTask } from "../../../../lib/planning/types";
import { churchMonthKey } from "./format";

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  recurring: boolean;
  recur_freq: "weekly" | "monthly";
  recur_weekdays: number[] | null;
  recur_monthly_week: number | null;
  recur_monthly_weekday: number | null;
  recur_until: string | null;
  recur_except: string[] | null;
  area: { name: string } | null;
  category: { name: string; chip_class: string } | null;
}

export type Occurrence = EventOccurrence<EventRow>;

export interface SeriesInMonth {
  event: EventRow;
  count: number;
  first: Occurrence;
  // The next one still to come this month, if any.
  next: Occurrence | null;
}

export interface MonthBlock {
  key: MonthKey;
  meeting: PlanningMeeting | null;
  tasks: PlanningTask[];
  events: Occurrence[];
  series: SeriesInMonth[];
}

export async function loadEvents(supabase: SupabaseClient): Promise<EventRow[]> {
  // Recurring events are single rows + a rule (0062); they're expanded into
  // occurrences at read time so each shows in its own months.
  const { data } = await supabase
    .from("events")
    .select(
      `id, title, description, start_at, end_at, location,
       recurring, recur_freq, recur_weekdays, recur_monthly_week, recur_monthly_weekday, recur_until, recur_except,
       area:areas(name),
       category:event_categories(name, chip_class)`,
    )
    .is("deleted_at", null);
  return (data as unknown as EventRow[]) ?? [];
}

// Every occurrence from the start of `from` to the end of `to`, in the club's
// months. The window is padded a day each side (it's resolved in UTC) and
// trimmed back by month afterwards.
export function occurrencesBetween(events: EventRow[], from: MonthKey, to: MonthKey): Occurrence[] {
  const start = new Date(`${firstDayOf(from)}T00:00:00Z`);
  const end = new Date(`${lastDayOf(to)}T23:59:59Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  end.setUTCDate(end.getUTCDate() + 1);
  return expandEventOccurrences(events, { from: start, to: end }).filter((o) => {
    const k = churchMonthKey(o.startAt);
    return k >= from && k <= to;
  });
}

// The months that have one-off events (so Past and All reach back to them).
export function eventMonths(events: EventRow[]): MonthKey[] {
  return events.filter((e) => !e.recurring).map((e) => churchMonthKey(e.start_at));
}

export function buildMonths(
  months: MonthKey[],
  occurrences: Occurrence[],
  tasks: PlanningTask[],
  meetings: Map<MonthKey, PlanningMeeting>,
  nowMs: number,
): MonthBlock[] {
  const blocks = new Map<MonthKey, MonthBlock>(
    months.map((k) => [k, { key: k, meeting: meetings.get(k) ?? null, tasks: [], events: [], series: [] }]),
  );
  for (const t of tasks) blocks.get(t.month)?.tasks.push(t);

  const sorted = [...occurrences].sort((a, b) => a.startAt.localeCompare(b.startAt));
  const seriesIndex = new Map<string, SeriesInMonth>();
  for (const o of sorted) {
    const k = churchMonthKey(o.startAt);
    const block = blocks.get(k);
    if (!block) continue;
    if (!o.recurringInstance) {
      block.events.push(o);
      continue;
    }
    const id = `${k}:${o.event.id}`;
    let s = seriesIndex.get(id);
    if (!s) {
      s = { event: o.event, count: 0, first: o, next: null };
      seriesIndex.set(id, s);
      block.series.push(s);
    }
    s.count += 1;
    if (!s.next && new Date(o.startAt).getTime() >= nowMs) s.next = o;
  }
  return months.map((k) => blocks.get(k)!);
}

// How far the calendar reaches. Upcoming runs from this month through the
// end of the season (at least six months), or later if something's planned
// further out. Past runs from last month back to the start of this season,
// or earlier if there's history. Nothing goes more than three years either way.
export function calendarRange(
  current: MonthKey,
  seasonFirstMonth: MonthKey,
  dataMonths: MonthKey[],
): { pastFrom: MonthKey; pastTo: MonthKey; upFrom: MonthKey; upTo: MonthKey } {
  const floor = addMonths(current, -36);
  const ceiling = addMonths(current, 36);
  const inReach = dataMonths.filter((m) => m >= floor && m <= ceiling).sort();
  const earliest = inReach[0];
  const latest = inReach[inReach.length - 1];

  const seasonLast = addMonths(seasonFirstMonth, 11);
  let upTo = seasonLast > addMonths(current, 5) ? seasonLast : addMonths(current, 5);
  if (latest && latest > upTo) upTo = latest;

  let pastFrom = seasonFirstMonth;
  if (earliest && earliest < pastFrom) pastFrom = earliest;

  return { pastFrom, pastTo: addMonths(current, -1), upFrom: current, upTo };
}
