"use server";

// Server actions for restoring + hard-deleting Dave's Idea recordings.
// Mirrors the convention used by lib/auth/member-actions.ts.
//
// Soft-delete is handled inline by the client (RLS lets the owner set
// deleted_at on their own row). Restore + hard-delete go through these
// actions so we can:
//   - Run the deleted_at precondition server-side for hard delete (so a
//     stale client can't escalate to permanent loss in one click).
//   - Clean up the audio file in Vercel Blob on hard delete.

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

type Result = { success?: true; error?: string };

export async function restoreDavesIdeaRecording(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("daves_idea_recordings")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/daves-idea");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function hardDeleteDavesIdeaRecording(id: string): Promise<Result> {
  const supabase = await createClient();

  // Load the target so we can verify it's already soft-deleted and grab
  // the blob URL before the DB row goes away.
  const { data: row } = await supabase
    .from("daves_idea_recordings")
    .select("id, deleted_at, audio_blob_url")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Recording not found." };

  const target = row as { id: string; deleted_at: string | null; audio_blob_url: string };
  if (!target.deleted_at) {
    return { error: "Soft-delete the recording first." };
  }

  // Best-effort blob cleanup. If this fails (already gone, etc.) we still
  // proceed with DB delete — orphaning the row is worse than orphaning a
  // blob, and the latter is recoverable from billing data if needed.
  if (target.audio_blob_url) {
    try {
      await del(target.audio_blob_url);
    } catch (err) {
      console.warn("Blob delete failed, continuing with DB delete", err);
    }
  }

  // FK on daves_idea_action_items has ON DELETE CASCADE, so action items
  // disappear automatically.
  const { error } = await supabase
    .from("daves_idea_recordings")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}
