// Release notes (Settings → Release Notes, migration 0138). Pure rules the
// form, the list and the tests share: areas match the roadmap, a note is a
// dated entry with an optional step-by-step "Show me how".

import { AREAS, isArea, formatDay, todayIso, type Area, type RoadmapItem } from "../roadmap/model.ts";

export { AREAS, isArea, formatDay, todayIso };
export type { Area };

export const TITLE_MAX = 120;
export const SUMMARY_MAX = 2000;
export const STEPS_MAX = 12;
export const STEP_TITLE_MAX = 80;
export const STEP_BODY_MAX = 800;
export const MEDIA_URL_MAX = 500;
export const HREF_MAX = 300;

export const RELEASE_NOTE_COLUMNS =
  "id, released_on, title, area, summary, steps, media_url, href, roadmap_item_id, created_at, updated_at, seed_key";

export interface HowStep {
  title: string;
  body: string;
  media_url: string | null;
  href: string | null;
}

export interface HowStepInput {
  title: string;
  body: string;
  mediaUrl?: string;
  href?: string;
}

export interface ReleaseNote {
  id: string;
  released_on: string;
  title: string;
  area: string;
  summary: string;
  steps: HowStep[];
  media_url: string | null;
  href: string | null;
  roadmap_item_id: string | null;
  created_at: string;
  updated_at?: string;
  seed_key?: string | null;
}

export interface ReleaseNoteInput {
  title: string;
  area: string;
  summary: string;
  releasedOn: string;
  steps: HowStepInput[];
  mediaUrl?: string;
  href?: string;
  roadmapItemId?: string | null;
}

export interface CleanReleaseNote {
  title: string;
  area: Area;
  summary: string;
  released_on: string;
  steps: HowStep[];
  media_url: string | null;
  href: string | null;
  roadmap_item_id: string | null;
}

export interface DayGroup {
  day: string;
  notes: ReleaseNote[];
}

function isDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// An http(s) address, or what's wrong with it. Empty is allowed (null).
export function cleanHttpUrl(
  raw: string,
  label: string,
  max = MEDIA_URL_MAX
): { error: string } | { url: string | null } {
  const v = raw.trim();
  if (!v) return { url: null };
  if (v.length > max) return { error: `Keep the ${label} to ${max} characters or fewer.` };
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { error: `The ${label} has to be an http or https address.` };
    }
  } catch {
    return { error: `The ${label} has to be an http or https address.` };
  }
  return { url: v };
}

// A portal path (/portal/…) or an http(s) address. Empty is allowed (null).
export function cleanHref(raw: string): { error: string } | { href: string | null } {
  const v = raw.trim();
  if (!v) return { href: null };
  if (v.length > HREF_MAX) return { error: `Keep the page link to ${HREF_MAX} characters or fewer.` };
  if (v.startsWith("/portal/") || v === "/portal") return { href: v };
  const http = cleanHttpUrl(v, "page link", HREF_MAX);
  if ("error" in http) return http;
  return { href: http.url };
}

export function cleanHowStep(input: HowStepInput, index: number): { error: string } | HowStep {
  const n = index + 1;
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title && !body && !input.mediaUrl?.trim() && !input.href?.trim()) {
    return { error: `Step ${n} is empty. Add a title, or remove it.` };
  }
  if (!title) return { error: `Give step ${n} a title.` };
  if (title.length > STEP_TITLE_MAX) {
    return { error: `Keep step ${n}'s title to ${STEP_TITLE_MAX} characters or fewer.` };
  }
  if (!body) return { error: `Say what to do in step ${n}.` };
  if (body.length > STEP_BODY_MAX) {
    return { error: `Keep step ${n} to ${STEP_BODY_MAX} characters or fewer.` };
  }
  const media = cleanHttpUrl(input.mediaUrl ?? "", `step ${n} screenshot or video`);
  if ("error" in media) return media;
  const href = cleanHref(input.href ?? "");
  if ("error" in href) return href;
  return { title, body, media_url: media.url, href: href.href };
}

export function cleanSteps(raw: HowStepInput[]): { error: string } | HowStep[] {
  if (raw.length > STEPS_MAX) {
    return { error: `Keep the walkthrough to ${STEPS_MAX} steps or fewer.` };
  }
  const steps: HowStep[] = [];
  for (let i = 0; i < raw.length; i++) {
    const step = cleanHowStep(raw[i], i);
    if ("error" in step) return step;
    steps.push(step);
  }
  return steps;
}

function cleanRoadmapItemId(raw: string | null | undefined): { error: string } | { id: string | null } {
  const v = (raw ?? "").trim();
  if (!v) return { id: null };
  if (!isUuid(v)) return { error: "That roadmap item isn't valid." };
  return { id: v };
}

export function cleanReleaseNote(input: ReleaseNoteInput): { error: string } | CleanReleaseNote {
  const title = input.title.trim();
  if (!title) return { error: "Give it a title." };
  if (title.length > TITLE_MAX) return { error: `Keep the title to ${TITLE_MAX} characters or fewer.` };
  const summary = input.summary.trim();
  if (!summary) return { error: "Write a short summary." };
  if (summary.length > SUMMARY_MAX) {
    return { error: `Keep the summary to ${SUMMARY_MAX} characters or fewer.` };
  }
  if (!isArea(input.area)) return { error: "Pick an area." };
  const day = input.releasedOn.trim();
  if (!isDay(day)) return { error: "Enter the day it went live." };
  const steps = cleanSteps(input.steps);
  if ("error" in steps) return steps;
  const media = cleanHttpUrl(input.mediaUrl ?? "", "screenshot or video");
  if ("error" in media) return media;
  const href = cleanHref(input.href ?? "");
  if ("error" in href) return href;
  const roadmap = cleanRoadmapItemId(input.roadmapItemId);
  if ("error" in roadmap) return roadmap;
  return {
    title,
    area: input.area,
    summary,
    released_on: day,
    steps,
    media_url: media.url,
    href: href.href,
    roadmap_item_id: roadmap.id,
  };
}

// Parse the jsonb column from Supabase into steps the UI can render.
export function parseSteps(raw: unknown): HowStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: HowStep[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title : "";
    const body = typeof r.body === "string" ? r.body : "";
    if (!title && !body) continue;
    const media = typeof r.media_url === "string" ? r.media_url : null;
    const href = typeof r.href === "string" ? r.href : null;
    steps.push({ title, body, media_url: media, href });
  }
  return steps;
}

export function asReleaseNote(row: Record<string, unknown>): ReleaseNote {
  return {
    id: String(row.id ?? ""),
    released_on: String(row.released_on ?? ""),
    title: String(row.title ?? ""),
    area: String(row.area ?? ""),
    summary: String(row.summary ?? ""),
    steps: parseSteps(row.steps),
    media_url: typeof row.media_url === "string" ? row.media_url : null,
    href: typeof row.href === "string" ? row.href : null,
    roadmap_item_id: typeof row.roadmap_item_id === "string" ? row.roadmap_item_id : null,
    created_at: String(row.created_at ?? ""),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
    seed_key: typeof row.seed_key === "string" ? row.seed_key : null,
  };
}

export function hasHow(note: { steps: HowStep[]; media_url?: string | null }): boolean {
  return note.steps.length > 0 || !!note.media_url;
}

// The slides the "Show me how" overlay walks through. A note with only a
// screenshot/video and no steps still gets a one-slide demo.
export function walkthroughSteps(note: ReleaseNote): HowStep[] {
  if (note.steps.length > 0) return note.steps;
  if (note.media_url) {
    return [{ title: note.title, body: note.summary, media_url: note.media_url, href: note.href }];
  }
  return [];
}

export function groupByDay(notes: ReleaseNote[]): DayGroup[] {
  const sorted = [...notes].sort(
    (a, b) => b.released_on.localeCompare(a.released_on) || a.title.localeCompare(b.title)
  );
  const groups: DayGroup[] = [];
  for (const note of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.day === note.released_on) last.notes.push(note);
    else groups.push({ day: note.released_on, notes: [note] });
  }
  return groups;
}

export function filterByArea(notes: ReleaseNote[], area: string): ReleaseNote[] {
  if (!area || area === "all") return notes;
  return notes.filter((n) => n.area === area);
}

// Prefill a note from a released roadmap item so a live board card can feed
// Settings → Release Notes.
export function draftFromRoadmap(item: Pick<RoadmapItem, "id" | "title" | "description" | "area" | "status" | "released_on">): {
  error: string;
} | ReleaseNoteInput {
  if (item.status !== "released") return { error: "Only released roadmap items can become a release note." };
  if (!item.released_on) return { error: "That released item is missing its live date." };
  return {
    title: item.title,
    area: item.area,
    summary: item.description,
    releasedOn: item.released_on,
    steps: [],
    roadmapItemId: item.id,
  };
}

export type MediaKind = "image" | "video" | "youtube" | "vimeo" | "link";

export function mediaKind(url: string | null | undefined): MediaKind | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") return "youtube";
  if (host === "vimeo.com" || host === "player.vimeo.com") return "vimeo";
  if (/\.(mp4|webm|mov)(\?|$)/.test(path)) return "video";
  if (/\.(png|jpe?g|gif|webp|svg)(\?|$)/.test(path)) return "image";
  return "link";
}

export function youtubeEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (u.searchParams.get("v")) id = u.searchParams.get("v") ?? "";
    else {
      const m = u.pathname.match(/\/embed\/([^/?]+)/);
      if (m) id = m[1];
    }
    if (!id) return null;
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  } catch {
    return null;
  }
}

export function vimeoEmbedSrc(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/(?:video\/)?(\d+)/);
    if (!m) return null;
    return `https://player.vimeo.com/video/${m[1]}`;
  } catch {
    return null;
  }
}

export function emptyForm(day = todayIso()): ReleaseNoteInput {
  return {
    title: "",
    area: "Portal",
    summary: "",
    releasedOn: day,
    steps: [],
    mediaUrl: "",
    href: "",
    roadmapItemId: null,
  };
}

export function formFromNote(note: ReleaseNote): ReleaseNoteInput {
  return {
    title: note.title,
    area: note.area,
    summary: note.summary,
    releasedOn: note.released_on,
    steps: note.steps.map((s) => ({
      title: s.title,
      body: s.body,
      mediaUrl: s.media_url ?? "",
      href: s.href ?? "",
    })),
    mediaUrl: note.media_url ?? "",
    href: note.href ?? "",
    roadmapItemId: note.roadmap_item_id,
  };
}
