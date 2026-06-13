"use server";

// Server actions for soft-deleting, restoring, and hard-deleting ReelNotes
// recordings.
//
// All three actions share the same shape: verify the caller via getUser()
// from the cookie-authed Supabase client, confirm the target row belongs to
// them, then run the write via the admin client so we don't need to thread
// the operation through RLS policies. This sidesteps a class of mysterious
// "new row violates RLS" failures that can crop up when a policy's USING /
// WITH CHECK clauses don't quite agree, and gives us explicit, debuggable
// ownership checks in TypeScript.

import { del } from "@vercel/blob";
import { AUDIO_BUCKET, isStorageAudio, storageAudioPath } from "reelnotes";
import type { CreateProjectInput } from "reelnotes/ui";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { createProjectFromRecording } from "../projects/actions";

type Result = { success?: true; error?: string };

// Adapts the package UI's onCreateProject hook to MCC: turn a recording's open
// action items into a Project + Tasks, then hand back the host route to land on.
// (A server action so it can be passed as a prop to the client component.)
export async function createProjectFromReelNotes(
  input: CreateProjectInput,
): Promise<{ redirectTo?: string; error?: string }> {
  const res = await createProjectFromRecording(input);
  if (res.error) return { error: res.error };
  return res.projectId
    ? { redirectTo: `/portal/tasks/projects/${res.projectId}` }
    : { error: "Failed to create project." };
}

// Looks up the caller and confirms the target recording is theirs. Returns
// the row (with the fields callers need) so each action can act on it.
async function loadOwnedRecording(id: string): Promise<
  | { row: { id: string; user_id: string; deleted_at: string | null; audio_blob_url: string } }
  | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Use admin to read so we still see the row even when our SELECT policy
  // would filter it (e.g. when the row is soft-deleted but the caller is
  // restoring it). Ownership is enforced just below.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("reel_notes_recordings")
    .select("id, user_id, deleted_at, audio_blob_url")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Recording not found." };

  const row = data as { id: string; user_id: string; deleted_at: string | null; audio_blob_url: string };
  if (row.user_id !== user.id) return { error: "Forbidden." };
  return { row };
}

export async function softDeleteReelNotesRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };
  if (owned.row.deleted_at) return { success: true }; // Already deleted; idempotent.

  const admin = createAdminClient();
  const { error } = await admin
    .from("reel_notes_recordings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/reelnotes");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function restoreReelNotesRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("reel_notes_recordings")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/reelnotes");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function hardDeleteReelNotesRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };
  if (!owned.row.deleted_at) return { error: "Soft-delete the recording first." };

  // Best-effort audio cleanup. If this fails (already gone, etc.) we still
  // proceed with DB delete — orphaning the row is worse than orphaning a
  // blob, and the latter is recoverable from billing data if needed.
  // B6: new recordings live in the private bucket (storage: marker); pre-B6
  // ones are public Vercel blobs and still go through del().
  if (owned.row.audio_blob_url) {
    try {
      if (isStorageAudio(owned.row.audio_blob_url)) {
        const admin = createAdminClient();
        await admin.storage
          .from(AUDIO_BUCKET)
          .remove([storageAudioPath(owned.row.audio_blob_url)]);
      } else {
        await del(owned.row.audio_blob_url);
      }
    } catch (err) {
      console.warn("Audio delete failed, continuing with DB delete", err);
    }
  }

  // FK on reel_notes_action_items has ON DELETE CASCADE, so action items
  // disappear automatically.
  const admin = createAdminClient();
  const { error } = await admin
    .from("reel_notes_recordings")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}
