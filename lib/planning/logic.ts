// The rules behind Planning, kept pure so they're unit-tested
// (tests/unit/planning.test.ts): how a template becomes a season's tasks,
// which month a task belongs to, and how a month's agenda is drafted. Safe to
// import from client components.

import {
  SEASON_START_MONTH,
  firstDayOf,
  isMonthKey,
  lastDayOf,
  monthKeyOf,
  seasonMonth,
  type MonthKey,
} from "./season.ts"; // explicit extension so node --test can load this file
import type { MeetingStatus, PlanningTemplate } from "./types.ts";

// The chip colors a role can wear (the same five the app's chips come in).
export const ROLE_CHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "rsd-chip-accent", label: "Lightning blue" },
  { value: "rsd-chip-success", label: "Green" },
  { value: "rsd-chip-warn", label: "Amber" },
  { value: "rsd-chip-error", label: "Red" },
  { value: "rsd-chip-mute", label: "Gray" },
];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  planned: "Planned",
  held: "Held",
  skipped: "No meeting",
};

// A task's description is its title line, then its notes (the task pages show
// the first line as the title).
export function taskDescription(title: string, notes: string | null | undefined): string {
  const t = title.trim();
  const n = (notes ?? "").trim();
  return n ? `${t}\n\n${n}` : t;
}

export function splitDescription(description: string): { title: string; notes: string | null } {
  const [first, ...rest] = description.split("\n");
  const notes = rest.join("\n").trim();
  return { title: first.trim(), notes: notes || null };
}

// The month a season's task is planned for: its deadline's month, else its
// start's, else where the template put it. Moving the deadline on the task
// page moves it on the calendar.
export function taskMonth(t: {
  due_on: string | null;
  start_on: string | null;
  planning_season: number | null;
  template_month: number | null;
}): MonthKey | null {
  if (t.due_on) return monthKeyOf(t.due_on);
  if (t.start_on) return monthKeyOf(t.start_on);
  if (t.planning_season != null && t.template_month != null) {
    return seasonMonth(t.planning_season, t.template_month);
  }
  return null;
}

export interface SeasonTaskRow {
  description: string;
  status: "open";
  review_status: "pending_review";
  start_on: string;
  due_on: string;
  planning_template_id: string;
  planning_season: number;
}

// The tasks a season gets from the template: one per monthly task line it
// doesn't already have (tossed ones included, so a tossed task stays tossed).
// Year-round duties and agenda topics aren't tasks. Each lands on the first of
// its month, due the last day.
export function seasonTasksFromTemplates(
  templates: PlanningTemplate[],
  season: number,
  existingTemplateIds: Iterable<string>,
): SeasonTaskRow[] {
  const have = new Set(existingTemplateIds);
  return templates
    .filter((t) => t.kind === "task" && t.month != null && !have.has(t.id))
    .map((t) => {
      const key = seasonMonth(season, t.month as number);
      return {
        description: taskDescription(t.title, t.notes),
        status: "open" as const,
        review_status: "pending_review" as const,
        start_on: firstDayOf(key),
        due_on: lastDayOf(key),
        planning_template_id: t.id,
        planning_season: season,
      };
    });
}

// A first draft of a month's agenda from the template's topics for that month,
// as a markdown list the board edits freely.
export function agendaDraft(templates: PlanningTemplate[], month: number): string {
  return templates
    .filter((t) => t.kind === "agenda" && t.month === month)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => {
      const notes = (t.notes ?? "").trim().replace(/\s*\n\s*/g, " ");
      return notes ? `- **${t.title.trim()}**: ${notes}` : `- **${t.title.trim()}**`;
    })
    .join("\n");
}

// Template lines in the order the page lists them: by month through the
// season (year-round first), then sort order, then title.
export function templateOrder(month: number | null): number {
  if (month == null) return 0;
  return ((month - SEASON_START_MONTH + 12) % 12) + 1;
}

export function sortTemplates<T extends Pick<PlanningTemplate, "month" | "sort_order" | "title">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      templateOrder(a.month) - templateOrder(b.month) ||
      a.sort_order - b.sort_order ||
      a.title.localeCompare(b.title),
  );
}

// Parse a "YYYY-MM" route segment; null when it isn't one.
export function parseMonthParam(s: string | undefined): MonthKey | null {
  return isMonthKey(s) ? s : null;
}

// Parse a ?season= value into a season year, or null.
export function parseSeasonParam(s: string | undefined): number | null {
  if (!s || !/^\d{4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 2000 && n <= 2100 ? n : null;
}
