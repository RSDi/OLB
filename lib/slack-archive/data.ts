// Server-side loaders for /portal/slack-archive. Super-admin only — RLS on
// slack_archive_channels/messages/sync_state (migration 0077) already scopes
// reads to public.is_super_admin(), but loadArchiveViewer() redirects before
// any query runs, mirroring lib/reelnotes/data.ts's loadReelNotesViewer().

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer, type Viewer } from "../auth/viewer";
import { signArchiveFileUrl, type ArchivedFile } from "./files";

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
  const [{ data: channels, error: chErr }, { data: states }] = await Promise.all([
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
  const anyFiles = rows.some((r) => (r.files ?? []).some((f) => f.storage_path));
  const admin = anyFiles ? createAdminClient() : null;

  if (admin) {
    await Promise.all(
      rows.map(async (r) => {
        r.files = await Promise.all(
          (r.files ?? []).map(async (f) => {
            if (!f.storage_path) return f;
            const signedUrl = await signArchiveFileUrl(admin, f.storage_path);
            return signedUrl ? { ...f, permalink: signedUrl } : f;
          }),
        );
      }),
    );
  }

  const byTs = new Map(rows.map((r) => [r.ts, r]));
  const parents: ArchiveThread[] = [];
  const repliesByParent = new Map<string, ArchiveMessage[]>();

  for (const r of rows) {
    const isParent = !r.thread_ts || r.thread_ts === r.ts;
    if (isParent) continue;
    if (!byTs.has(r.thread_ts!)) continue; // parent outside this fetch window — treat orphan replies as standalone below
    const list = repliesByParent.get(r.thread_ts!) ?? [];
    list.push(r);
    repliesByParent.set(r.thread_ts!, list);
  }

  for (const r of rows) {
    const isParent = !r.thread_ts || r.thread_ts === r.ts;
    if (!isParent) continue;
    parents.push({ parent: r, replies: repliesByParent.get(r.ts) ?? [] });
  }

  return parents;
}
