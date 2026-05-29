"use server";

// Server actions for soft-deleting, restoring, and hard-deleting Dave's Idea
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
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

type Result = { success?: true; error?: string };

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
    .from("daves_idea_recordings")
    .select("id, user_id, deleted_at, audio_blob_url")
    .eq("id", id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Recording not found." };

  const row = data as { id: string; user_id: string; deleted_at: string | null; audio_blob_url: string };
  if (row.user_id !== user.id) return { error: "Forbidden." };
  return { row };
}

export async function softDeleteDavesIdeaRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };
  if (owned.row.deleted_at) return { success: true }; // Already deleted; idempotent.

  const admin = createAdminClient();
  const { error } = await admin
    .from("daves_idea_recordings")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/daves-idea");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function restoreDavesIdeaRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("daves_idea_recordings")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/daves-idea");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function hardDeleteDavesIdeaRecording(id: string): Promise<Result> {
  const owned = await loadOwnedRecording(id);
  if ("error" in owned) return { error: owned.error };
  if (!owned.row.deleted_at) return { error: "Soft-delete the recording first." };

  // Best-effort blob cleanup. If this fails (already gone, etc.) we still
  // proceed with DB delete — orphaning the row is worse than orphaning a
  // blob, and the latter is recoverable from billing data if needed.
  if (owned.row.audio_blob_url) {
    try {
      await del(owned.row.audio_blob_url);
    } catch (err) {
      console.warn("Blob delete failed, continuing with DB delete", err);
    }
  }

  // FK on daves_idea_action_items has ON DELETE CASCADE, so action items
  // disappear automatically.
  const admin = createAdminClient();
  const { error } = await admin
    .from("daves_idea_recordings")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}
