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
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer } from "../auth/viewer";

type Result = { success?: true; error?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mark a recorded comment's action item as routed to a destination (e.g.
// "Things"). The push itself is the client's device-only URL scheme; this
// records where it went. Staff-update RLS on linked recordings' action items
// (0064) permits it. ticketId is for revalidation only.
export async function setActionItemRouted(
  actionId: string,
  ticketId: string,
  target: string,
): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer?.isStaff) return { error: "Not authorized." };
  if (!UUID_RE.test(actionId)) return { error: "Invalid item." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reel_notes_action_items")
    .update({ routed_to: target })
    .eq("id", actionId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/tasks/${ticketId}`);
  return { success: true };
}

export async function toggleActionItemDone(
  actionId: string,
  ticketId: string,
  done: boolean,
): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer?.isStaff) return { error: "Not authorized." };
  if (!UUID_RE.test(actionId)) return { error: "Invalid item." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reel_notes_action_items")
    .update({ done })
    .eq("id", actionId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/tasks/${ticketId}`);
  return { success: true };
}

// Per-user opt-in for the device-only Things push. Written with the admin
// client against the caller's own member row (members RLS doesn't grant
// self-update of arbitrary columns), so the ownership check is explicit.
export async function setMyThingsEnabled(enabled: boolean): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("members")
    .update({ things_enabled: enabled })
    .eq("id", viewer.memberId);
  if (error) return { error: error.message };
  return { success: true };
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
