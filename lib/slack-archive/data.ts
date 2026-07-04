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

export async function loadArchiveViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) redirect("/portal");
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
}

export async function loadArchiveChannels(): Promise<ArchiveChannel[]> {
  const supabase = await createClient();
  const [{ data: channels, error: chErr }, { data: states, error: stErr }] = await Promise.all([
    supabase
      .from("slack_archive_channels")
      .select("id, slack_channel_id, label, active, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("slack_archive_sync_state").select("channel_id, last_ts, last_run_at, last_status, last_error"),
  ]);
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
    return {
      ...c,
      last_ts: state?.last_ts ?? null,
      last_run_at: state?.last_run_at ?? null,
      last_status: state?.last_status ?? null,
      last_error: state?.last_error ?? null,
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

// Cross-channel view for the exceptions page — pulls every message with any
// file attachment across every registered channel and filters to the ones
// that carry an error, rather than requiring a click into each channel to
// find them. Files with an error never have a storage_path (that's what the
// error means), so unlike loadArchiveChannelMessages there's no signed URL
// to resolve — every failed file's link is always its Slack permalink.
export async function loadAllFailedFiles(channels: ArchiveChannel[]): Promise<FailedFileEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slack_archive_messages")
    .select("id, channel_id, ts, author_name, message_text, posted_at, files")
    .order("posted_at", { ascending: false });
  if (error) {
    console.error("loadAllFailedFiles failed", error);
    return [];
  }

  const labelByChannel = new Map(channels.map((c) => [c.slack_channel_id, c.label]));
  const rows = (data ?? []) as {
    id: string;
    channel_id: string;
    ts: string;
    author_name: string | null;
    message_text: string;
    posted_at: string;
    files: ArchivedFile[];
  }[];

  return rows.flatMap((r) =>
    (r.files ?? [])
      .filter((f) => f.error)
      .map((f) => ({
        channelId: r.channel_id,
        channelLabel: labelByChannel.get(r.channel_id) ?? r.channel_id,
        messageId: r.id,
        messageTs: r.ts,
        messageText: r.message_text,
        authorName: r.author_name,
        postedAt: r.posted_at,
        file: f,
      })),
  );
}

// Groups flat rows into threads (a parent with thread_ts === its own ts or
// null, followed by any replies whose thread_ts points at it) and resolves
// each file's storage_path to a short-lived signed URL. Signing needs the
// admin client — the bucket carries no storage.objects read policies at all
// (like reel-notes-audio), so even a super-admin session can't read it
// directly.
export async function loadArchiveChannelMessages(slackChannelId: string): Promise<ArchiveThread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("slack_archive_messages")
    .select("id, ts, thread_ts, author_name, message_text, reactions, files, posted_at, edited")
    .eq("channel_id", slackChannelId)
    .order("posted_at", { ascending: true });
  if (error) {
    console.error("loadArchiveChannelMessages failed", error);
    return [];
  }

  const rows = (data ?? []) as ArchiveMessage[];
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
