// The roadmap's rules (/portal/roadmap, migration 0129), pure and with no
// server imports: the actions check input with these and the board renders
// with them, so both agree. The tests use them too.

// Parts of the app an item belongs to. Adding one is a code change here, not
// a migration.
export const AREAS = ["Portal", "Website", "Registration", "Payments", "HS Schedule", "Slack & email"] as const;
export type Area = (typeof AREAS)[number];

export type Status = "released" | "progress" | "planned" | "proposed";

// The board's columns, left to right. `hint` is for the board, `publicHint`
// for families reading the shared link.
export const STATUSES: { key: Status; label: string; hint: string; publicHint: string }[] = [
  { key: "released", label: "Released", hint: "Live in the app, newest first.", publicHint: "Live now." },
  { key: "progress", label: "In progress", hint: "Being built now.", publicHint: "Being built now." },
  { key: "planned", label: "Planned", hint: "Decided on, not started.", publicHint: "On the way, not started yet." },
  { key: "proposed", label: "Proposed", hint: "Ideas, not decided yet.", publicHint: "Ideas we're thinking about." },
];

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  area: string;
  status: Status;
  // The day it went live. Only released items have one.
  released_on: string | null;
  created_at: string;
}

export interface RoadmapItemInput {
  title: string;
  description: string;
  area: string;
  status: string;
  releasedOn: string;
}

export interface CleanRoadmapItem {
  title: string;
  description: string;
  area: Area;
  status: Status;
  released_on: string | null;
}

export function isArea(v: string): v is Area {
  return (AREAS as readonly string[]).includes(v);
}

export function isStatus(v: string): v is Status {
  return STATUSES.some((s) => s.key === v);
}

function isDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// The row to save, or what's wrong with the form.
export function cleanRoadmapItem(input: RoadmapItemInput): { error: string } | CleanRoadmapItem {
  const title = input.title.trim();
  if (!title) return { error: "Give it a title." };
  if (title.length > TITLE_MAX) return { error: `Keep the title to ${TITLE_MAX} characters or fewer.` };
  const description = input.description.trim();
  if (description.length > DESCRIPTION_MAX) {
    return { error: `Keep the description to ${DESCRIPTION_MAX} characters or fewer.` };
  }
  if (!isArea(input.area)) return { error: "Pick an area." };
  if (!isStatus(input.status)) return { error: "Pick a column." };
  if (input.status !== "released") {
    return { title, description, area: input.area, status: input.status, released_on: null };
  }
  const day = input.releasedOn.trim();
  if (!isDay(day)) return { error: "Enter the day it went live." };
  return { title, description, area: input.area, status: "released", released_on: day };
}

// One column's items: released newest first, the rest oldest first, so a new
// idea lands at the bottom of its column.
export function columnItems(items: RoadmapItem[], status: Status): RoadmapItem[] {
  const list = items.filter((i) => i.status === status);
  if (status === "released") {
    return list.sort(
      (a, b) => (b.released_on ?? "").localeCompare(a.released_on ?? "") || a.title.localeCompare(b.title)
    );
  }
  return list.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// "Oct 9", or "Oct 9, 2025" outside the current year.
export function formatDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso + "T12:00:00Z");
  const sameYear = d.getUTCFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

// Today in the viewer's own time zone, as YYYY-MM-DD.
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
