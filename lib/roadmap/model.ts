// The roadmap's rules (/portal/roadmap, migrations 0129, 0136 and 0154), pure
// and with no server imports: the actions check input with these and the board
// renders with them, so both agree. The tests use them too.

// Parts of the app an item belongs to. Adding one is a code change here, not
// a migration.
export const AREAS = ["Portal", "Website", "Registration", "Payments", "HS Schedule", "Slack & email"] as const;
export type Area = (typeof AREAS)[number];

export type Status = "released" | "preview" | "progress" | "planned" | "proposed" | "parked";

// The board's columns, left to right. `hint` is for the board, `publicHint`
// for families reading the shared link.
export const STATUSES: { key: Status; label: string; hint: string; publicHint: string }[] = [
  { key: "released", label: "Released", hint: "Live in the app, newest first.", publicHint: "Live now." },
  { key: "preview", label: "Preview", hint: "Up on a preview, not live yet.", publicHint: "A preview you can try." },
  { key: "progress", label: "In progress", hint: "Being built now.", publicHint: "Being built now." },
  { key: "planned", label: "Planned", hint: "Decided on, not started.", publicHint: "On the way, not started yet." },
  { key: "proposed", label: "Proposed", hint: "Ideas, not decided yet.", publicHint: "Ideas we're thinking about." },
  { key: "parked", label: "Parked", hint: "Set aside, not in the pipeline.", publicHint: "Set aside for now." },
];

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const PREVIEW_URL_MAX = 500;
export const NOTE_MAX = 2000;

export function statusLabel(status: Status): string {
  return STATUSES.find((s) => s.key === status)?.label ?? status;
}

// A bot (or later, a person) move or note on a card. Oldest first. The
// board's edit sheet lists these; the public share page never gets them.
export interface RoadmapEvent {
  id: string;
  actor: string;
  from_status: Status;
  to_status: Status;
  note: string | null;
  created_at: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description: string;
  area: string;
  status: Status;
  // The day it went live. Only released items have one.
  released_on: string | null;
  preview_url: string | null;
  created_at: string;
  // Who approved a Proposed item onto Planned, and when. Null until Approve.
  approved_by: string | null;
  approved_at: string | null;
  approved_by_name: string | null;
  // Bot notes on the card. The public share page leaves these empty.
  latest_note?: string | null;
  events?: RoadmapEvent[];
}

export interface RoadmapItemInput {
  title: string;
  description: string;
  area: string;
  status: string;
  releasedOn: string;
  previewUrl?: string;
}

export interface CleanRoadmapItem {
  title: string;
  description: string;
  area: Area;
  status: Status;
  released_on: string | null;
  preview_url: string | null;
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

// A Vercel preview (or other http/https) link, or what's wrong with it.
// Required when the item is in the Preview column.
export function cleanPreviewUrl(raw: string, required: boolean): { error: string } | { preview_url: string | null } {
  const v = raw.trim();
  if (!v) {
    if (required) return { error: "Add the preview link." };
    return { preview_url: null };
  }
  if (v.length > PREVIEW_URL_MAX) {
    return { error: `Keep the preview link to ${PREVIEW_URL_MAX} characters or fewer.` };
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { error: "The preview link has to be an http or https address." };
    }
  } catch {
    return { error: "The preview link has to be an http or https address." };
  }
  return { preview_url: v };
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
  const url = cleanPreviewUrl(input.previewUrl ?? "", input.status === "preview");
  if ("error" in url) return url;
  if (input.status !== "released") {
    return { title, description, area: input.area, status: input.status, released_on: null, preview_url: url.preview_url };
  }
  const day = input.releasedOn.trim();
  if (!isDay(day)) return { error: "Enter the day it went live." };
  return { title, description, area: input.area, status: "released", released_on: day, preview_url: url.preview_url };
}

// One column's items: released newest first, the rest oldest first, so a new
// idea lands at the bottom of its column. Area filtering happens before this
// — the board's area chips pass a subset in, and each column still sorts
// the same way.
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

// "Approved by Jeff Malone on Oct 16" for a Planned card. Needs both a name
// and a timestamp; otherwise the card stays quiet.
export function formatApprovedBy(
  name: string | null | undefined,
  at: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const who = name?.trim() ?? "";
  const day = (at ?? "").slice(0, 10);
  if (!who || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return `Approved by ${who} on ${formatDay(day, now)}`;
}

// Newest non-empty note on a card. Events are oldest-first.
export function latestNote(events: Pick<RoadmapEvent, "note">[] | null | undefined): string | null {
  if (!events?.length) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const n = events[i].note?.trim() ?? "";
    if (n) return n;
  }
  return null;
}

// "Proposed → Parked", or just the column when the bot only left a note.
export function formatRoadmapMove(from: Status, to: Status): string {
  if (from === to) return statusLabel(to);
  return `${statusLabel(from)} → ${statusLabel(to)}`;
}

// "Bot · Proposed → Parked · Oct 19" for the card history.
export function formatRoadmapEvent(
  ev: Pick<RoadmapEvent, "actor" | "from_status" | "to_status" | "created_at">,
  now: Date = new Date(),
): string {
  const who = ev.actor === "bot" ? "Bot" : ev.actor;
  const day = ev.created_at.slice(0, 10);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(day) ? formatDay(day, now) : ev.created_at;
  return `${who} · ${formatRoadmapMove(ev.from_status, ev.to_status)} · ${when}`;
}
