// Server-side loaders for /portal/slack-archive. Super-admin only — RLS on
// slack_archive_channels/messages/sync_state (migration 0077) already scopes
// reads to public.is_super_admin(), but loadArchiveViewer() redirects before
// any query runs, mirroring lib/reelnotes/data.ts's loadReelNotesViewer().

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer, type Viewer } from "../auth/viewer";
import { signArchiveFileUrls, type ArchivedFile } from "./files";

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
  reactions: { name: string; count: number }[];
  files: ArchivedFile[];
  posted_at: string;
  edited: boolean;
}

export interface ArchiveThread {
  parent: ArchiveMessage;
  replies: ArchiveMessage[];
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
