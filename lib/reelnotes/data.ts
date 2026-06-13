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
import type { ReelNotesRecording, AssignableMember } from "reelnotes";

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
    .from("daves_idea_recordings")
    .select(
      `id, user_id, title, audio_blob_url, duration_sec, source, status,
       assemblyai_id, transcript, utterances, summary, error, created_at, updated_at,
       action_items:daves_idea_action_items(
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
  // rows hold plain https blob URLs and pass through unchanged.
  if (rows.some(r => isStorageAudio(r.audio_blob_url))) {
    const admin = createAdminClient();
    await Promise.all(
      rows.map(async r => {
        r.audio_blob_url = await signAudioUrl(admin, r.audio_blob_url);
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
