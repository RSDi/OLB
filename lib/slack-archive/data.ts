// Server-side loaders for /portal/slack-archive. Super-admin only — RLS on
// slack_archive_channels/messages/sync_state (migration 0077) already scopes
// reads to public.is_super_admin(), but loadArchiveViewer() redirects before
// any query runs, mirroring lib/reelnotes/data.ts's loadReelNotesViewer().

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer, type Viewer } from "../auth/viewer";
import { signArchiveFileUrls, type ArchivedFile } from "./files";
import type { StoredReaction } from "./sync";
import {
  albumMediaKind,
  buildAlbumItems,
  isThreadReply,
  orderAlbumItems,
  threadParentKey,
  thumbnailPathFor,
  type AlbumItem,
  type AlbumMediaKind,
  type AlbumSourceMessage,
  type AlbumThreadParent,
} from "./album";
import { decodeSlackEntities } from "./text";

// Who may open the archive at all: any approved member (super admins
// always). Which channels — and so which messages and photos — they then
// see is decided by row-level security (migration 0084): public channels
// for everyone, private ones only for members of that Slack channel. This
// gate just keeps pending/denied accounts out of the pages entirely.
export function canViewArchive(viewer: Viewer | null): viewer is Viewer {
  return Boolean(viewer && (viewer.isSuperAdmin || viewer.status === "approved"));
}

export async function loadArchiveViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!canViewArchive(viewer)) redirect("/portal");
  return viewer;
}

// For the pages that manage the archive rather than read it (sync
// exceptions, compression, previews) — still super-admin only.
export async function loadArchiveAdmin(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) redirect("/portal/slack-archive");
  return viewer;
}

export interface ArchiveChannel {
  id: string;
  slack_channel_id: string;
  label: string;
  active: boolean;
  created_at: string;
  last_ts: string | null;
  last_run_at: string | null;
  last_status: "ok" | "error" | null;
  last_error: string | null;
  // Mirrored from Slack by the sync (migration 0084). null = not confirmed
  // with Slack yet, which RLS treats as private (super admins only).
  is_private: boolean | null;
  access_checked_at: string | null;
  access_error: string | null;
}

type ChannelAccessRow = Pick<ArchiveChannel, "slack_channel_id" | "is_private" | "access_checked_at" | "access_error">;

export async function loadArchiveChannels(): Promise<ArchiveChannel[]> {
  const supabase = await createClient();
  const [{ data: channels, error: chErr }, { data: states, error: stErr }, { data: access, error: acErr }] = await Promise.all([
    supabase
      .from("slack_archive_channels")
      .select("id, slack_channel_id, label, active, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("slack_archive_sync_state").select("channel_id, last_ts, last_run_at, last_status, last_error"),
    // Separate, best-effort query (like getViewer's grants): if migration
    // 0084 hasn't been applied yet the columns don't exist, and the list
    // should still render rather than come up empty.
    supabase.from("slack_archive_channels").select("slack_channel_id, is_private, access_checked_at, access_error"),
  ]);
  if (acErr) console.error("loadArchiveChannels: access columns query failed (migration 0084 applied?)", acErr);
  const accessByChannel = new Map(((access ?? []) as ChannelAccessRow[]).map((a) => [a.slack_channel_id, a]));
  if (chErr) {
    console.error("loadArchiveChannels failed", chErr);
    return [];
  }
  if (stErr) {
    // Non-fatal — channels still render, just without sync status, and this
    // is logged rather than silently showing "Not synced yet" for channels
    // that are actually syncing fine.
    console.error("loadArchiveChannels: sync_state query failed", stErr);
  }

  const stateByChannel = new Map(
    ((states ?? []) as { channel_id: string; last_ts: string | null; last_run_at: string | null; last_status: "ok" | "error" | null; last_error: string | null }[]).map(
      (s) => [s.channel_id, s],
    ),
  );

  return (
    (channels ?? []) as { id: string; slack_channel_id: string; label: string; active: boolean; created_at: string }[]
  ).map((c) => {
    const state = stateByChannel.get(c.slack_channel_id);
    const acc = accessByChannel.get(c.slack_channel_id);
    return {
      ...c,
      last_ts: state?.last_ts ?? null,
      last_run_at: state?.last_run_at ?? null,
      last_status: state?.last_status ?? null,
      last_error: state?.last_error ?? null,
      is_private: acc?.is_private ?? null,
      access_checked_at: acc?.access_checked_at ?? null,
      access_error: acc?.access_error ?? null,
    };
  });
}

export interface ArchiveMessage {
  id: string;
  ts: string;
  thread_ts: string | null;
  author_name: string | null;
  message_text: string;
  reactions: StoredReaction[];
  files: ArchivedFile[];
  posted_at: string;
  edited: boolean;
}

export interface ArchiveThread {
  parent: ArchiveMessage;
  replies: ArchiveMessage[];
}

export interface FailedFileEntry {
  channelId: string;
  channelLabel: string;
  messageId: string;
  messageTs: string;
  messageText: string;
  authorName: string | null;
  postedAt: string;
  file: ArchivedFile;
}

type FailedFileRow = {
  id: string;
  channel_id: string;
  ts: string;
  author_name: string | null;
  message_text: string;
  posted_at: string;
  files: ArchivedFile[];
};

export interface FailedFilesResult {
  entries: FailedFileEntry[];
  totalScanned: number; // surfaced on the page so a pagination/query regression is visible, not silent
  deletedInSlack: number; // files Slack deleted before they could be archived, counted instead of listed
  queryError: string | null;
}

// Cross-channel view for the exceptions page — pulls every message with any
// file attachment across every registered channel and filters to the ones
// that carry an error, rather than requiring a click into each channel to
// find them. Files Slack had already deleted when the archive first saw them
// are only counted: nothing can be downloaded or fixed, so listing them just
// buries the entries someone can act on. Files with an error never have a
// storage_path (that's what the error means), so unlike
// loadArchiveChannelMessages there's no signed URL to resolve — every
// failed file's link is always its Slack permalink.
//
// Paginated by primary key, NOT by posted_at/OFFSET: migration 0077 only
// indexes (channel_id, posted_at) together, which can't help a cross-channel
// sort, so ordering the whole table by posted_at forced a full sort on every
// page — OFFSET pagination made each subsequent page scan+discard more rows
// than the last, and at ~9,500 rows this blew Postgres's statement timeout
// (confirmed in production: "canceling statement due to statement timeout").
// Keyset pagination on `id` uses the primary key's own index for both the
// seek and the order, so cost per page stays flat regardless of table size.
// Newest-first ordering for display happens in JS afterward, over the much
// smaller filtered result set, instead of asking Postgres to sort everything
// up front.
export async function loadAllFailedFiles(channels: ArchiveChannel[]): Promise<FailedFilesResult> {
  const supabase = await createClient();
  const PAGE_SIZE = 1000;
  const rows: FailedFileRow[] = [];
  let queryError: string | null = null;
  let lastId: string | null = null;
  for (;;) {
    const base = supabase
      .from("slack_archive_messages")
      .select("id, channel_id, ts, author_name, message_text, posted_at, files")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const { data, error } = await (lastId ? base.gt("id", lastId) : base);
    if (error) {
      console.error("loadAllFailedFiles failed", error);
      queryError = error.message;
      break;
    }
    const page = (data ?? []) as FailedFileRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }

  const labelByChannel = new Map(channels.map((c) => [c.slack_channel_id, c.label]));

  const failed = rows.flatMap((r) => (r.files ?? []).filter((f) => f.error).map((f) => ({ r, f })));
  const entries = failed
    .filter(({ f }) => !f.deleted_in_slack)
    .map(({ r, f }) => ({
      channelId: r.channel_id,
      channelLabel: labelByChannel.get(r.channel_id) ?? r.channel_id,
      messageId: r.id,
      messageTs: r.ts,
      messageText: r.message_text,
      authorName: r.author_name,
      postedAt: r.posted_at,
      file: f,
    }));
  entries.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  return { entries, totalScanned: rows.length, deletedInSlack: failed.length - entries.length, queryError };
}

export interface ArchiveAuthor {
  name: string;
  count: number;
}

// Distinct authors across every channel, for the search page's "filter by
// user" picker. Delegates the count to Postgres (archive_author_counts(),
// migration 0079) instead of paginating the whole messages table into JS
// just to dedupe — a GROUP BY using the (author_name, posted_at) index
// costs nothing close to shipping 9,500+ rows over the wire on every visit.
//
// Error is returned (not just logged) so the page can tell "the migration
// hasn't been applied yet" apart from "no authors exist" — a silently
// empty picker looks identical to both otherwise.
export async function loadArchiveAuthors(): Promise<{ authors: ArchiveAuthor[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_author_counts");
  if (error) {
    console.error("loadArchiveAuthors failed", error);
    return { authors: [], error: error.message };
  }
  const authors = ((data ?? []) as { author_name: string; message_count: number }[]).map((r) => ({
    name: r.author_name,
    count: r.message_count,
  }));
  return { authors, error: null };
}

// Faceted narrowing for the search page's "filter by user" picker: authors
// scoped to whatever's currently selected in the OTHER facets (channel(s)
// and/or text query), via archive_author_counts_filtered (migration 0082) —
// never scoped by the user's own current selection, so picking one author
// doesn't shrink the list out from under the others. Passing no channelIds
// and no query is equivalent to loadArchiveAuthors()'s unfiltered list.
export async function loadArchiveAuthorCounts(opts: {
  query?: string;
  channelIds?: string[];
}): Promise<{ authors: ArchiveAuthor[]; error: string | null }> {
  const supabase = await createClient();
  const query = opts.query?.trim() || null;
  const channelIds = opts.channelIds?.filter(Boolean) ?? [];
  const { data, error } = await supabase.rpc("archive_author_counts_filtered", {
    p_query: query,
    p_channel_ids: channelIds.length > 0 ? channelIds : null,
  });
  if (error) {
    console.error("loadArchiveAuthorCounts failed", error);
    return { authors: [], error: error.message };
  }
  const authors = ((data ?? []) as { author_name: string; message_count: number }[]).map((r) => ({
    name: r.author_name,
    count: r.message_count,
  }));
  return { authors, error: null };
}

export interface ArchiveChannelCount {
  channelId: string;
  count: number;
}

// Faceted narrowing for the search page's "filter by channel" picker:
// channels scoped to whatever's currently selected in the OTHER facets
// (author(s) and/or text query), via archive_channel_counts_filtered
// (migration 0082) — same never-scoped-by-itself rule as
// loadArchiveAuthorCounts above.
export async function loadArchiveChannelCounts(opts: {
  query?: string;
  authors?: string[];
}): Promise<{ channels: ArchiveChannelCount[]; error: string | null }> {
  const supabase = await createClient();
  const query = opts.query?.trim() || null;
  const authors = opts.authors?.filter(Boolean) ?? [];
  const { data, error } = await supabase.rpc("archive_channel_counts_filtered", {
    p_query: query,
    p_authors: authors.length > 0 ? authors : null,
  });
  if (error) {
    console.error("loadArchiveChannelCounts failed", error);
    return { channels: [], error: error.message };
  }
  const channels = ((data ?? []) as { channel_id: string; message_count: number }[]).map((r) => ({
    channelId: r.channel_id,
    count: r.message_count,
  }));
  return { channels, error: null };
}

export interface ArchiveSearchResult {
  channelId: string;
  channelLabel: string;
  messageId: string;
  messageTs: string;
  threadTs: string | null;
  authorName: string | null;
  messageText: string;
  postedAt: string;
}

const SEARCH_RESULT_LIMIT = 200;

// Search across every channel by author, channel, and/or message text.
// Requires at least one filter — an unfiltered query would sort the entire
// table with nothing to narrow it down first, exactly the shape of query
// that blew the statement timeout on the exceptions page. author_name
// filtering uses the (author_name, posted_at) index from 0078; channel_id
// filtering uses the (channel_id, posted_at) index from 0077 (each selected
// channel is its own indexed, already-sorted range, so even several of them
// combine cheaply under the LIMIT below); text search uses the generated
// tsvector column's GIN index via websearch_to_tsquery, which understands
// natural typed queries (including "quoted phrases") without the user
// needing to learn tsquery syntax.
export async function searchArchiveMessages(
  channels: ArchiveChannel[],
  opts: { authors?: string[]; query?: string; channelIds?: string[] },
): Promise<{ results: ArchiveSearchResult[]; error: string | null }> {
  const authors = opts.authors?.filter(Boolean) ?? [];
  const query = opts.query?.trim() ?? "";
  const channelIds = opts.channelIds?.filter(Boolean) ?? [];
  if (authors.length === 0 && !query && channelIds.length === 0) return { results: [], error: null };

  const supabase = await createClient();
  let q = supabase
    .from("slack_archive_messages")
    .select("id, channel_id, ts, thread_ts, author_name, message_text, posted_at")
    .order("posted_at", { ascending: false })
    .limit(SEARCH_RESULT_LIMIT);

  if (authors.length > 0) q = q.in("author_name", authors);
  if (channelIds.length > 0) q = q.in("channel_id", channelIds);
  if (query) q = q.textSearch("message_text_search", query, { type: "websearch", config: "english" });

  const { data, error } = await q;
  if (error) {
    console.error("searchArchiveMessages failed", error);
    return { results: [], error: error.message };
  }

  const labelByChannel = new Map(channels.map((c) => [c.slack_channel_id, c.label]));
  const rows = (data ?? []) as {
    id: string;
    channel_id: string;
    ts: string;
    thread_ts: string | null;
    author_name: string | null;
    message_text: string;
    posted_at: string;
  }[];

  const results = rows.map((r) => ({
    channelId: r.channel_id,
    channelLabel: labelByChannel.get(r.channel_id) ?? r.channel_id,
    messageId: r.id,
    messageTs: r.ts,
    threadTs: r.thread_ts,
    authorName: r.author_name,
    messageText: r.message_text,
    postedAt: r.posted_at,
  }));

  return { results, error: null };
}

// Groups flat rows into threads (a parent with thread_ts === its own ts or
// null, followed by any replies whose thread_ts points at it) and resolves
// each file's storage_path to a short-lived signed URL. Signing needs the
// admin client — the bucket carries no storage.objects read policies at all
// (like reel-notes-audio), so even a super-admin session can't read it
// directly.
export async function loadArchiveChannelMessages(slackChannelId: string): Promise<ArchiveThread[]> {
  const supabase = await createClient();

  // Paginated explicitly rather than one unbounded select — PostgREST caps
  // an unbounded query at its project-configured max rows (1000 by default),
  // silently truncating rather than erroring. A channel's full history
  // crossing that count (e.g. after a full-history backfill) would then
  // render only its oldest N messages with everything newer invisible, with
  // no error anywhere to notice by. Scoped to one channel_id and ordered by
  // the (channel_id, posted_at) index from migration 0077, so each page is a
  // cheap indexed range scan, unlike the cross-channel case in
  // loadAllFailedFiles that needed keyset pagination to avoid a full sort.
  const PAGE_SIZE = 1000;
  const rows: ArchiveMessage[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("slack_archive_messages")
      .select("id, ts, thread_ts, author_name, message_text, reactions, files, posted_at, edited")
      .eq("channel_id", slackChannelId)
      .order("posted_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.error("loadArchiveChannelMessages failed", error);
      break;
    }
    const page = (data ?? []) as ArchiveMessage[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const allPaths = rows.flatMap((r) => (r.files ?? []).flatMap((f) => (f.storage_path ? [f.storage_path] : [])));
  if (allPaths.length > 0) {
    const admin = createAdminClient();
    const signedUrls = await signArchiveFileUrls(admin, allPaths);
    for (const r of rows) {
      r.files = (r.files ?? []).map((f) => {
        const signedUrl = f.storage_path ? signedUrls.get(f.storage_path) : undefined;
        return signedUrl ? { ...f, permalink: signedUrl } : f;
      });
    }
  }

  // Single pass, relying on posted_at ascending order so a parent always
  // appears before its replies. A reply whose parent isn't in this fetch
  // (e.g. the parent's own sync run hasn't happened yet) renders as its own
  // standalone thread rather than silently vanishing.
  const parents: ArchiveThread[] = [];
  const threadByParentTs = new Map<string, ArchiveThread>();

  for (const r of rows) {
    const isParent = !r.thread_ts || r.thread_ts === r.ts;
    if (isParent) {
      const thread: ArchiveThread = { parent: r, replies: [] };
      parents.push(thread);
      threadByParentTs.set(r.ts, thread);
      continue;
    }
    const parentThread = threadByParentTs.get(r.thread_ts!);
    if (parentThread) {
      parentThread.replies.push(r);
    } else {
      parents.push({ parent: r, replies: [] });
    }
  }

  return parents;
}

// ─── Photo album ────────────────────────────────────────────────────────

// Album previews are signed for longer than the channel page's one-hour
// attachment links: an album is something you browse for a while, and a
// preview that expires mid-scroll just leaves a hole. They're small derived
// images of files only super admins can reach in the first place. Full-size
// originals don't need this — the viewer loads them through the media route,
// which signs a fresh URL per request.
const ALBUM_PREVIEW_TTL_SECONDS = 3 * 60 * 60;

export interface ArchiveAlbum {
  items: AlbumItem[];      // oldest first; the page orders them for display
  missingPreviews: number; // items the thumbnail job hasn't reached yet
  signedAt: number;        // when the preview URLs were minted (epoch ms)
  previewTtlMs: number;
  queryError: string | null;
}

type ArchiveSupabase = Awaited<ReturnType<typeof createClient>>;

const ALBUM_MESSAGE_COLUMNS = "id, channel_id, ts, thread_ts, author_name, message_text, posted_at, files";

function hasAlbumMedia(row: AlbumSourceMessage): boolean {
  return (row.files ?? []).some((f) => f?.storage_path && !f.error && albumMediaKind(f));
}

function decodeAlbumRow(row: AlbumSourceMessage): AlbumSourceMessage {
  return { ...row, message_text: decodeSlackEntities(row.message_text ?? "") };
}

// The text of the thread each reply was posted in, so a photo posted as a
// bare reply is still findable by what the thread was about ("Roof repair
// update"). One indexed lookup per channel (chunked to keep URLs short) via
// the (channel_id, ts) unique index from migration 0077.
async function loadAlbumThreadParents(
  supabase: ArchiveSupabase,
  replies: AlbumSourceMessage[],
): Promise<Map<string, AlbumThreadParent>> {
  const tsByChannel = new Map<string, Set<string>>();
  for (const r of replies) {
    if (!r.thread_ts) continue;
    const set = tsByChannel.get(r.channel_id) ?? new Set<string>();
    set.add(r.thread_ts);
    tsByChannel.set(r.channel_id, set);
  }

  const CHUNK_SIZE = 150;
  const lookups: PromiseLike<{ data: unknown; error: { message: string } | null }>[] = [];
  for (const [channelId, tsSet] of tsByChannel) {
    const threadTs = [...tsSet];
    for (let i = 0; i < threadTs.length; i += CHUNK_SIZE) {
      lookups.push(
        supabase
          .from("slack_archive_messages")
          .select("channel_id, ts, author_name, message_text")
          .eq("channel_id", channelId)
          .in("ts", threadTs.slice(i, i + CHUNK_SIZE)),
      );
    }
  }

  const parents = new Map<string, AlbumThreadParent>();
  for (const { data, error } of await Promise.all(lookups)) {
    if (error) {
      // Non-fatal — the photos still show; they just lose their thread's
      // text as search context.
      console.error("loadArchiveAlbum: thread parent lookup failed", error);
      continue;
    }
    for (const p of (data ?? []) as { channel_id: string; ts: string; author_name: string | null; message_text: string }[]) {
      parents.set(threadParentKey(p.channel_id, p.ts), {
        author: p.author_name,
        text: decodeSlackEntities(p.message_text ?? ""),
      });
    }
  }
  return parents;
}

// Every stored photo and video across every registered channel (inactive
// ones included — their history stays browsable), for the album page.
//
// Scans only messages that carry attachments at all (`files <> '[]'`), with
// the same keyset-on-`id` pagination as loadAllFailedFiles and for the same
// reason: a cross-channel posted_at sort has no index to lean on. Display
// order is applied afterwards, in JS, over the much smaller media set.
//
// Each item's grid image is its generated preview when one exists
// (thumbnailPathFor; made by scripts/slack-archive-generate-thumbnails.ts),
// else the full original for photos, else nothing for videos — the page
// shows a placeholder tile until the thumbnail job reaches it.
export async function loadArchiveAlbum(): Promise<ArchiveAlbum> {
  const supabase = await createClient();
  const PAGE_SIZE = 1000;
  const rows: AlbumSourceMessage[] = [];
  let queryError: string | null = null;
  let lastId: string | null = null;
  for (;;) {
    const base = supabase
      .from("slack_archive_messages")
      .select(ALBUM_MESSAGE_COLUMNS)
      .neq("files", "[]")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const { data, error } = await (lastId ? base.gt("id", lastId) : base);
    if (error) {
      console.error("loadArchiveAlbum failed", error);
      queryError = error.message;
      break;
    }
    const page = (data ?? []) as AlbumSourceMessage[];
    for (const row of page) if (hasAlbumMedia(row)) rows.push(decodeAlbumRow(row));
    if (page.length < PAGE_SIZE) break;
    lastId = page[page.length - 1].id;
  }

  const parents = await loadAlbumThreadParents(supabase, rows.filter(isThreadReply));
  const items = buildAlbumItems(rows, parents);
  const signedAt = Date.now();
  if (items.length === 0) {
    return { items, missingPreviews: 0, signedAt, previewTtlMs: ALBUM_PREVIEW_TTL_SECONDS * 1000, queryError };
  }

  const admin = createAdminClient();
  const previews = await signArchiveFileUrls(admin, items.map((i) => thumbnailPathFor(i.path)), ALBUM_PREVIEW_TTL_SECONDS);
  const photosWithoutPreview = items.filter((i) => i.kind === "image" && !previews.has(thumbnailPathFor(i.path)));
  const originals = await signArchiveFileUrls(admin, photosWithoutPreview.map((i) => i.path), ALBUM_PREVIEW_TTL_SECONDS);

  let missingPreviews = 0;
  for (const item of items) {
    const preview = previews.get(thumbnailPathFor(item.path));
    if (preview) {
      item.thumbUrl = preview;
      item.hasThumb = true;
    } else {
      missingPreviews += 1;
      item.thumbUrl = item.kind === "image" ? (originals.get(item.path) ?? null) : null;
    }
  }

  return { items, missingPreviews, signedAt, previewTtlMs: ALBUM_PREVIEW_TTL_SECONDS * 1000, queryError };
}

export interface AlbumPreviewTile {
  id: string;
  kind: AlbumMediaKind;
  url: string;
}

// A few of the newest photos for the album card on /portal/slack-archive.
// One small query (the latest posts with attachments) rather than the full
// album scan, so the channel list page stays quick. Best-effort: any failure
// just leaves the card without pictures.
export async function loadAlbumPreviewTiles(count = 4): Promise<AlbumPreviewTile[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("slack_archive_messages")
      .select(ALBUM_MESSAGE_COLUMNS)
      .neq("files", "[]")
      .order("posted_at", { ascending: false })
      .limit(60);
    if (error) {
      console.error("loadAlbumPreviewTiles failed", error);
      return [];
    }
    const rows = ((data ?? []) as AlbumSourceMessage[]).filter(hasAlbumMedia);
    const candidates = orderAlbumItems(buildAlbumItems(rows, new Map()), "newest").slice(0, count * 3);
    if (candidates.length === 0) return [];

    const admin = createAdminClient();
    const previews = await signArchiveFileUrls(admin, candidates.map((i) => thumbnailPathFor(i.path)), ALBUM_PREVIEW_TTL_SECONDS);
    const withPreview = candidates.filter((i) => previews.has(thumbnailPathFor(i.path)));
    if (withPreview.length > 0) {
      return withPreview.slice(0, count).map((i) => ({ id: i.id, kind: i.kind, url: previews.get(thumbnailPathFor(i.path))! }));
    }
    // No previews generated yet (the thumbnail job hasn't run) — fall back to
    // a few full-size photos so the card isn't empty in the meantime.
    const photos = candidates.filter((i) => i.kind === "image").slice(0, count);
    const originals = await signArchiveFileUrls(admin, photos.map((i) => i.path), ALBUM_PREVIEW_TTL_SECONDS);
    return photos.flatMap((i) => {
      const url = originals.get(i.path);
      return url ? [{ id: i.id, kind: i.kind, url }] : [];
    });
  } catch (err) {
    console.error("loadAlbumPreviewTiles failed", err);
    return [];
  }
}
