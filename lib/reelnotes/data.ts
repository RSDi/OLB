// Server-side loaders for /portal/reelnotes — MCC host glue over the reelnotes
// package. The shared types live in the package; they're re-exported here so
// existing call sites can keep importing from one place during the extraction.
//
// Visibility: every loader here is owner-only. RLS on the underlying tables
// filters to user_id = auth.uid(); loadReelNotesViewer() additionally redirects
// non-staff to /portal before any row is fetched.

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer } from "../auth/viewer";
import { isStorageAudio, signAudioUrl } from "reelnotes";
import type {
  ReelNotesRecording,
  ReelNotesActionItem,
  AssignableMember,
  ReelNotesSummarySection,
} from "reelnotes";

export type {
  RecordingStatus,
  RecordingSource,
  Utterance,
  ReelNotesActionItem,
  AssignableMember,
  ReelNotesSummaryBullet,
  ReelNotesSummarySection,
  ReelNotesRecording,
} from "reelnotes";

// Access guard. Redirects non-staff to /portal. Returns the viewer so callers
// have role/id available without a second fetch.
export async function loadReelNotesViewer() {
  const viewer = await getViewer();
  if (!viewer?.isStaff) redirect("/portal");
  return viewer;
}

export async function loadReelNotesRecordings(): Promise<ReelNotesRecording[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reel_notes_recordings")
    .select(
      `id, user_id, title, audio_blob_url, duration_sec, source, status,
       assemblyai_id, transcript, utterances, summary, error,
       linked_entity_type, linked_entity_id, created_at, updated_at,
       action_items:reel_notes_action_items(
         id, recording_id, text, routed_to, done, sort_order, priority,
         owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
         suggested_supporter_names, transcript_ms, created_at, updated_at
       )`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadReelNotesRecordings failed", error);
    return [];
  }
  // Postgrest returns the nested rows; coerce + sort action items by sort_order.
  const rows = ((data ?? []) as unknown as ReelNotesRecording[]).map(r => ({
    ...r,
    action_items: (r.action_items ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      // Defensive: a row with no array (older data) reads as [] for the UI.
      .map(a => ({
        ...a,
        supporter_member_ids: a.supporter_member_ids ?? [],
        suggested_supporter_names: a.suggested_supporter_names ?? [],
      })),
  }));

  // Swap private-storage markers for short-lived signed URLs (B6). Pre-B6
  // rows hold plain https blob URLs and pass through unchanged. Typed notes
  // have no audio (null) and are skipped.
  if (rows.some(r => r.audio_blob_url && isStorageAudio(r.audio_blob_url))) {
    const admin = createAdminClient();
    await Promise.all(
      rows.map(async r => {
        if (r.audio_blob_url && isStorageAudio(r.audio_blob_url)) {
          r.audio_blob_url = await signAudioUrl(admin, r.audio_blob_url);
        }
      }),
    );
  }
  return rows;
}

// Approved, non-deleted directory members available to assign to an action
// item. Not restricted to staff — committee members aren't necessarily admins.
// Mirrors the loader in app/portal/settings/AssignmentsTab.tsx, plus nickname.
export async function loadAssignableMembers(): Promise<AssignableMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, full_name, nickname")
    .eq("status", "approved")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("loadAssignableMembers failed", error);
    return [];
  }
  return (data ?? []) as AssignableMember[];
}

// ---------------------------------------------------------------------------
// ReelNotes-on-Tasks (take 2): a recorded note is a ticket comment. When a
// recording linked to a task finishes, its summary is posted as a comment
// tagged with recording_id (0065). To render that comment's action items
// inline in the thread, load the recordings behind a set of comments. Action
// items are staff-readable for linked recordings via RLS (0064); callers gate
// to staff, so non-staff simply get an empty map and see the plain comment text.
// ---------------------------------------------------------------------------

export interface CommentRecording {
  id: string;
  title: string | null;
  status: string;
  duration_sec: number;
  // Short-lived signed URL for playback, or null (typed/audioless or signing
  // skipped). The recorded comment plays this inline — no trip to ReelNotes.
  audio_url: string | null;
  transcript: string | null;
  summary: ReelNotesSummarySection[] | null;
  // Full action items so the task thread can reuse the package's ActionRow
  // (owner/supporters, suggested contacts, jump-to-moment).
  action_items: ReelNotesActionItem[];
}

export async function loadRecordingsForComments(
  recordingIds: string[],
): Promise<Map<string, CommentRecording>> {
  const ids = Array.from(new Set(recordingIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reel_notes_recordings")
    .select(
      `id, title, status, duration_sec, audio_blob_url, transcript, summary,
       action_items:reel_notes_action_items(
         id, recording_id, text, routed_to, done, sort_order, priority,
         owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
         suggested_supporter_names, transcript_ms, task_id, created_at, updated_at
       )`
    )
    .in("id", ids)
    .is("deleted_at", null);

  if (error) {
    // Tolerant pre-0064/0065: a missing column/RLS errors into an empty map
    // rather than throwing the whole task page.
    console.error("loadRecordingsForComments failed", error);
    return new Map();
  }

  type Row = CommentRecording & { audio_blob_url: string | null };
  const rows = (data ?? []) as unknown as Row[];

  // Swap private-storage markers for short-lived signed URLs so the comment can
  // play audio inline (B6). Plain https URLs / typed notes pass through.
  const admin = createAdminClient();
  const map = new Map<string, CommentRecording>();
  await Promise.all(
    rows.map(async r => {
      const marker = r.audio_blob_url;
      const audio_url =
        marker && isStorageAudio(marker) ? await signAudioUrl(admin, marker) : marker ?? null;
      map.set(r.id, {
        id: r.id,
        title: r.title,
        status: r.status,
        duration_sec: r.duration_sec ?? 0,
        audio_url,
        transcript: r.transcript ?? null,
        summary: r.summary ?? null,
        action_items: (r.action_items ?? [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(a => ({
            ...a,
            supporter_member_ids: a.supporter_member_ids ?? [],
            suggested_supporter_names: a.suggested_supporter_names ?? [],
          })),
      });
    }),
  );
  return map;
}

// Resolve each recording's generic parent link to a "source" backlink for the
// ReelNotes page (so a task-recorded note links back to its task). Only handles
// linked_entity_type='task' today; other types are skipped. Tolerant of a
// pre-0064 schema (returns an empty map).
export async function loadReelNotesSourceLinks(
  recordings: ReelNotesRecording[],
): Promise<Record<string, { label: string; href: string }>> {
  const taskByRecording = recordings
    .filter(r => r.linked_entity_type === "task" && r.linked_entity_id)
    .map(r => ({ recordingId: r.id, taskId: r.linked_entity_id as string }));
  if (taskByRecording.length === 0) return {};

  const supabase = await createClient();
  const taskIds = Array.from(new Set(taskByRecording.map(t => t.taskId)));
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("id, description")
    .in("id", taskIds);
  if (error) {
    console.error("loadReelNotesSourceLinks failed", error);
    return {};
  }

  const descById = new Map(
    ((data ?? []) as { id: string; description: string | null }[]).map(t => [t.id, t.description]),
  );
  const links: Record<string, { label: string; href: string }> = {};
  for (const { recordingId, taskId } of taskByRecording) {
    const desc = (descById.get(taskId) ?? "").trim();
    const short = desc.length > 48 ? `${desc.slice(0, 48)}…` : desc || "task";
    links[recordingId] = { label: `Task: ${short}`, href: `/portal/tasks/${taskId}` };
  }
  return links;
}

// Whether the current viewer has opted into the device-only "push to Things"
// affordance. Defaults false (and tolerates a pre-0064 schema).
export async function loadThingsEnabled(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("members")
    .select("things_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return false;
  return !!(data as { things_enabled?: boolean } | null)?.things_enabled;
}
