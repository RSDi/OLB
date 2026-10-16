"use server";

// Release notes (Settings → Release Notes, 0138). The board reads them;
// super-admins add, edit and soft-delete. RLS matches.

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards";
import { createClient } from "../supabase/server";
import { cleanReleaseNote, type ReleaseNoteInput } from "./model";

export interface ReleaseNoteResult {
  success?: boolean;
  error?: string;
}

function refresh() {
  revalidatePath("/portal/settings");
}

export async function saveReleaseNote(id: string | null, input: ReleaseNoteInput): Promise<ReleaseNoteResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const row = cleanReleaseNote(input);
  if ("error" in row) return { error: row.error };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("olb_release_notes").update(row).eq("id", id).is("deleted_at", null)
    : await supabase.from("olb_release_notes").insert({ ...row, created_by: gate.userId });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function deleteReleaseNote(id: string): Promise<ReleaseNoteResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_release_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}
