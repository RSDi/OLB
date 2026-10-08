// Pure helpers for the Slack archive's photo album (/portal/slack-archive/album):
// which archived attachments count as album media, where their preview
// thumbnails live, how message rows become album items, and the client-side
// search, filtering, and month grouping.
//
// Deliberately free of runtime imports (the one import below is type-only and
// erased) so the server loader (data.ts), the album's client components, the
// thumbnail script (scripts/slack-archive-generate-thumbnails.ts), and
// tests/unit can all share it — node:test runs this file directly.

import type { ArchivedFile } from "./files";

export type AlbumMediaKind = "image" | "video";

// Same mimetype-first, extension-fallback rule as the channel page's
// attachment chips (app/portal/slack-archive/[channelId]/MessageList.tsx) —
// Slack occasionally reports a generic mimetype for a perfectly normal
// photo or phone video.
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|ogv)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i;

export function albumMediaKind(file: Pick<ArchivedFile, "mimetype" | "name">): AlbumMediaKind | null {
  const mimetype = (file.mimetype ?? "").toLowerCase();
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.startsWith("image/")) return "image";
  const name = file.name ?? "";
  if (VIDEO_EXT.test(name)) return "video";
  if (IMAGE_EXT.test(name)) return "image";
  return null;
}

// Attachments the channel page shows in place — a photo, a playable video —
// rather than as a link: stored, downloaded without error, and kept in
// Slack (an external file like a Google Doc is only a link).
export function isInlineMedia(file: ArchivedFile): boolean {
  return Boolean(file.storage_path) && !file.error && !file.external && albumMediaKind(file) !== null;
}

// Photo formats most browsers can't show (an iPhone's HEIC, TIFF), so the
// channel page shows them in place only from their preview image.
const NEEDS_PREVIEW_TYPE = /^image\/(heic|heif|tiff)$/i;
const NEEDS_PREVIEW_EXT = /\.(heic|heif|tiff?)$/i;

export function needsPreviewToShow(file: Pick<ArchivedFile, "mimetype" | "name">): boolean {
  return NEEDS_PREVIEW_TYPE.test(file.mimetype ?? "") || NEEDS_PREVIEW_EXT.test(file.name ?? "");
}

export function showsInline(file: ArchivedFile, hasPreview: boolean): boolean {
  return isInlineMedia(file) && (hasPreview || !needsPreviewToShow(file));
}

// Preview thumbnails live in the same private bucket as the originals, under
// their own top-level prefix, at a path derived from the original's. Finding
// an item's thumbnail therefore needs no extra column or bookkeeping — and a
// "Sync now" re-walk, which rewrites every message's `files` JSON from
// scratch, can't orphan the link the way a stored thumbnail field would.
// Written by scripts/slack-archive-generate-thumbnails.ts.
export const THUMBNAIL_PREFIX = "thumbs/";

export function thumbnailPathFor(storagePath: string): string {
  return `${THUMBNAIL_PREFIX}${storagePath}.webp`;
}

// A storage path as the archive writes it: "<channel>/<ts>/<file id>-<name>"
// (the name through sanitizeFileName in files.ts), or its preview under
// "thumbs/". The media route serves nothing else. Storage resolves "..",
// "\" and "%2e" inside a path it's handed, so a looser check would let a
// path that starts with a channel the viewer can see reach another
// channel's files, or another bucket's.
const STORAGE_SEGMENT = /^[A-Za-z0-9._-]+$/;

export function isArchiveStoragePath(segments: string[]): boolean {
  return segments.length > 0 && segments.every((s) => STORAGE_SEGMENT.test(s) && s !== "." && s !== "..");
}

// Full-size originals are served through a same-origin route that signs a
// fresh URL per request (app/portal/slack-archive/media/[...path]/route.ts),
// so a viewer left open past a signed URL's expiry still loads the original.
export function albumMediaHref(storagePath: string, opts: { download?: string } = {}): string {
  const encoded = storagePath.split("/").map(encodeURIComponent).join("/");
  const query = opts.download ? `?download=${encodeURIComponent(opts.download)}` : "";
  return `/portal/slack-archive/media/${encoded}${query}`;
}

export interface AlbumItem {
  id: string;              // Slack file ID — the dedupe key and the ?photo= deep-link key
  kind: AlbumMediaKind;
  name: string;
  mimetype: string;
  size: number;
  path: string;            // storage path of the original
  thumbUrl: string | null; // signed grid image, filled in by the loader
  hasThumb: boolean;       // false: thumbUrl is the full original (no preview yet), or null for a video
  channelId: string;       // where it was first posted
  channelIds: string[];    // every registered channel it was posted in (almost always one)
  messageId: string;
  messageTs: string;
  author: string;
  text: string;            // the post's text, entity-decoded, trimmed to TEXT_LIMIT
  parentAuthor: string | null; // set when the post is a thread reply
  parentText: string | null;
  postedAt: string;        // ISO timestamp of the first post
  siblingIds: string[];    // every album item from the same post, in posted order; empty when it's the only one
}

export interface AlbumSourceMessage {
  id: string;
  channel_id: string;
  ts: string;
  thread_ts: string | null;
  author_name: string | null;
  message_text: string; // already entity-decoded by the caller
  posted_at: string;
  files: ArchivedFile[] | null;
}

export interface AlbumThreadParent {
  author: string | null;
  text: string; // already entity-decoded by the caller
}

export function threadParentKey(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

export function isThreadReply(row: Pick<AlbumSourceMessage, "ts" | "thread_ts">): boolean {
  return Boolean(row.thread_ts) && row.thread_ts !== row.ts;
}

// Captions ride along in the page payload for every item, so an occasional
// essay-length message shouldn't bloat it — the viewer links to the full
// conversation anyway.
const TEXT_LIMIT = 1000;
const PARENT_TEXT_LIMIT = 280;

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// Turns message rows into album items in ascending posted order (files keep
// their order within a post). Only attachments that actually made it into
// storage count — a failed download has nothing to show. A file shared into
// more than one channel keeps its first post's context and just gains the
// other channel IDs, so it appears once in the album but still turns up
// under either channel's filter.
export function buildAlbumItems(
  rows: AlbumSourceMessage[],
  parents: Map<string, AlbumThreadParent>,
): AlbumItem[] {
  const sorted = [...rows].sort((a, b) => a.posted_at.localeCompare(b.posted_at) || a.ts.localeCompare(b.ts));
  const items: AlbumItem[] = [];
  const byId = new Map<string, AlbumItem>();

  for (const row of sorted) {
    const fromThisPost: AlbumItem[] = [];
    const parent = isThreadReply(row) ? parents.get(threadParentKey(row.channel_id, row.thread_ts!)) : undefined;

    for (const file of row.files ?? []) {
      if (!file?.id || !file.storage_path || file.error) continue;
      const kind = albumMediaKind(file);
      if (!kind) continue;

      const existing = byId.get(file.id);
      if (existing) {
        if (!existing.channelIds.includes(row.channel_id)) existing.channelIds.push(row.channel_id);
        continue;
      }

      const item: AlbumItem = {
        id: file.id,
        kind,
        name: file.name || "Untitled",
        mimetype: file.mimetype ?? "",
        size: file.size ?? 0,
        path: file.storage_path,
        thumbUrl: null,
        hasThumb: false,
        channelId: row.channel_id,
        channelIds: [row.channel_id],
        messageId: row.id,
        messageTs: row.ts,
        author: row.author_name?.trim() || "Unknown",
        text: truncate(row.message_text ?? "", TEXT_LIMIT),
        parentAuthor: parent ? parent.author?.trim() || "Unknown" : null,
        parentText: parent ? truncate(parent.text, PARENT_TEXT_LIMIT) : null,
        postedAt: row.posted_at,
        siblingIds: [],
      };
      byId.set(file.id, item);
      fromThisPost.push(item);
      items.push(item);
    }

    if (fromThisPost.length > 1) {
      const ids = fromThisPost.map((i) => i.id);
      for (const item of fromThisPost) item.siblingIds = ids;
    }
  }

  return items;
}

export type AlbumSort = "newest" | "oldest";

// Items arrive oldest-first. Newest-first flips the order of posts but not
// the order of files within a post — a four-photo post still reads left to
// right the way it was shared.
export function orderAlbumItems(items: AlbumItem[], sort: AlbumSort): AlbumItem[] {
  if (sort === "oldest") return items;
  const posts: AlbumItem[][] = [];
  for (const item of items) {
    const current = posts[posts.length - 1];
    if (current && current[0].messageId === item.messageId) current.push(item);
    else posts.push([item]);
  }
  return posts.reverse().flat();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function albumMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

const monthFormatters = new Map<string, Intl.DateTimeFormat>();
// The album regroups on every keystroke, and formatToParts is the slow part;
// a timestamp's month never changes, so each is worked out once.
const monthCache = new Map<string, { key: string; year: number; month: number }>();

// Year and month (1–12) of a timestamp in the given timezone — the church's
// calendar month, not the server's UTC one, so a photo posted at 9pm on
// August 31st in Omaha files under August.
export function albumMonthOf(iso: string, timeZone: string): { key: string; year: number; month: number } {
  const cacheKey = `${timeZone}|${iso}`;
  const cached = monthCache.get(cacheKey);
  if (cached) return cached;
  let formatter = monthFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" });
    monthFormatters.set(timeZone, formatter);
  }
  let year = 0;
  let month = 0;
  for (const part of formatter.formatToParts(new Date(iso))) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
  }
  const result = { key: `${year}-${String(month).padStart(2, "0")}`, year, month };
  monthCache.set(cacheKey, result);
  return result;
}

export interface AlbumMonthGroup {
  key: string; // "2025-09"
  year: number;
  month: number;
  items: AlbumItem[];
}

// Consecutive grouping: items are already in display order (either
// direction), so a new group starts whenever the month changes.
export function groupAlbumByMonth(items: AlbumItem[], timeZone: string): AlbumMonthGroup[] {
  const groups: AlbumMonthGroup[] = [];
  for (const item of items) {
    const { key, year, month } = albumMonthOf(item.postedAt, timeZone);
    const current = groups[groups.length - 1];
    if (current && current.key === key) current.items.push(item);
    else groups.push({ key, year, month, items: [item] });
  }
  return groups;
}

// Case-, accent-, and curly-quote-insensitive, and drops the backslash
// escapes sync.ts adds to names spliced into message text (David\_Orrick).
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/\\([_*`[\]])/g, "$1")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Every whitespace-separated word must appear somewhere in an item's text
// (order-independent); "quoted phrases" must appear as written.
export function parseAlbumQuery(query: string): string[] {
  const terms: string[] = [];
  const normalized = normalizeForSearch(query.replace(/[“”]/g, '"'));
  for (const match of normalized.matchAll(/"([^"]*)"?|(\S+)/g)) {
    const term = (match[1] ?? match[2] ?? "").trim();
    if (term) terms.push(term);
  }
  return terms;
}

// What a search matches against: the caption, the thread it was posted in,
// the file name, who posted it, which channel(s), what kind of file it is,
// and when ("june 2024" narrows to that month).
export function albumSearchText(
  item: AlbumItem,
  channelLabels: Map<string, string>,
  timeZone: string,
): string {
  const { year, month } = albumMonthOf(item.postedAt, timeZone);
  const kindWords = item.kind === "video" ? "video" : /gif$/i.test(item.mimetype) ? "photo gif" : "photo";
  return normalizeForSearch(
    [
      item.text,
      item.parentText ?? "",
      item.name,
      item.author,
      item.channelIds.map((id) => channelLabels.get(id) ?? id).join(" "),
      kindWords,
      `${albumMonthName(month)} ${year}`,
    ].join(" "),
  );
}

export interface AlbumFilters {
  terms: string[];
  kind: AlbumMediaKind | null;
  channelIds: string[];
  people: string[];
}

export type AlbumFacet = "kind" | "channel" | "person";

// `ignore` leaves one facet out, for faceted counts: the channel picker's
// numbers come from everything except the channel selection itself, so
// choosing one channel doesn't zero out the rest of the list.
export function albumItemMatches(
  item: AlbumItem,
  searchText: string,
  filters: AlbumFilters,
  ignore?: AlbumFacet,
): boolean {
  if (ignore !== "kind" && filters.kind && item.kind !== filters.kind) return false;
  if (ignore !== "channel" && filters.channelIds.length > 0 && !item.channelIds.some((id) => filters.channelIds.includes(id))) {
    return false;
  }
  if (ignore !== "person" && filters.people.length > 0 && !filters.people.includes(item.author)) return false;
  return filters.terms.every((term) => searchText.includes(term));
}

// ─── URL state ──────────────────────────────────────────────────────────
// ?q=roof&type=videos&channel=C0123&person=Jeff+Malone&sort=oldest&photo=F0456
// — shareable, and restorable after a reload. channel/person repeat for
// multiple selections.

export interface AlbumUrlState {
  q: string;
  kind: AlbumMediaKind | null;
  channelIds: string[];
  people: string[];
  sort: AlbumSort;
  photo: string | null;
}

type ParamSource = Record<string, string | string[] | undefined>;

function paramValues(source: ParamSource, key: string): string[] {
  const value = source[key];
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values.map((v) => v.trim()).filter(Boolean);
}

export function parseAlbumUrlState(source: ParamSource): AlbumUrlState {
  const type = paramValues(source, "type")[0];
  return {
    q: paramValues(source, "q")[0] ?? "",
    kind: type === "photos" ? "image" : type === "videos" ? "video" : null,
    channelIds: [...new Set(paramValues(source, "channel"))],
    people: [...new Set(paramValues(source, "person"))],
    sort: paramValues(source, "sort")[0] === "oldest" ? "oldest" : "newest",
    photo: paramValues(source, "photo")[0] ?? null,
  };
}

export function albumUrlSearch(state: AlbumUrlState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.kind) params.set("type", state.kind === "image" ? "photos" : "videos");
  for (const id of state.channelIds) params.append("channel", id);
  for (const name of state.people) params.append("person", name);
  if (state.sort === "oldest") params.set("sort", "oldest");
  if (state.photo) params.set("photo", state.photo);
  const search = params.toString();
  return search ? `?${search}` : "";
}
