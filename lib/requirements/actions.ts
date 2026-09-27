"use server";

// Player requirements (migration 0098). The list is managed in Settings →
// Requirements by super-admins and board members with the settings grants;
// any board member marks players off from the Directory. RLS enforces the
// same split; these guards fail fast with a clear message.

import { revalidatePath } from "next/cache";
import { requireSettingsDelete, requireSettingsEdit, requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { cleanRequirementInput, type RequirementInput } from "./logic";
import { REQUIREMENT_FILES_BUCKET, type PlayerRequirementStatus } from "./types";

export interface RequirementResult {
  success?: boolean;
  error?: string;
}

// One hour: long enough to look at a scan; opening it again mints a new link.
const SIGNED_URL_TTL_SECONDS = 3600;

// The Directory and its team pages show requirement chips; Settings lists them.
function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/settings");
}

export async function createRequirement(input: RequirementInput): Promise<RequirementResult> {
  const gate = await requireSettingsEdit();
  if ("error" in gate) return { error: gate.error };
  const c = cleanRequirementInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  // New requirements go to the bottom of the list.
  const { data: last } = await supabase
    .from("olb_requirements")
    .select("sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10;

  const { error } = await supabase
    .from("olb_requirements")
    .insert({ ...c, sort_order: sortOrder, created_by: gate.userId });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function updateRequirement(id: string, input: RequirementInput): Promise<RequirementResult> {
  const gate = await requireSettingsEdit();
  if ("error" in gate) return { error: gate.error };
  const c = cleanRequirementInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const { error } = await supabase.from("olb_requirements").update(c).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Soft delete: the requirement leaves Settings and the Directory. Players'
// records stay in the database with it.
export async function deleteRequirement(id: string): Promise<RequirementResult> {
  const gate = await requireSettingsDelete();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_requirements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Swap a requirement with its neighbour, renumbering the (short) list so ties
// can't make a move a no-op.
export async function moveRequirement(id: string, direction: "up" | "down"): Promise<RequirementResult> {
  const gate = await requireSettingsEdit();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("olb_requirements")
    .select("id")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  if (error) return { error: error.message };
  const ids = ((data as { id: string }[]) ?? []).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { success: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];

  const results = await Promise.all(
    ids.map((reqId, n) => supabase.from("olb_requirements").update({ sort_order: (n + 1) * 10 }).eq("id", reqId))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  refresh();
  return { success: true };
}

export interface MarkPlayerRequirementInput {
  playerId: string;
  requirementId: string;
  status: PlayerRequirementStatus;
  completedOn: string;
  note: string;
  // The scan uploaded from the browser (lib/requirements/upload.ts), or null
  // for none. Leave undefined to keep whatever is already attached.
  file?: { path: string; name: string } | null;
}

function filePrefix(playerId: string, requirementId: string): string {
  return `${playerId}/${requirementId}/`;
}

async function existingFilePath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerId: string,
  requirementId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("olb_player_requirements")
    .select("file_path")
    .eq("player_id", playerId)
    .eq("requirement_id", requirementId)
    .maybeSingle();
  return (data as { file_path: string | null } | null)?.file_path ?? null;
}

export async function markPlayerRequirement(input: MarkPlayerRequirementInput): Promise<RequirementResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (input.status !== "done" && input.status !== "waived") return { error: "Pick a status." };
  const completedOn = input.completedOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return { error: "Enter a valid date." };
  if (input.file && !input.file.path.startsWith(filePrefix(input.playerId, input.requirementId))) {
    return { error: "That file doesn't belong to this player." };
  }

  const supabase = await createClient();
  const previous = await existingFilePath(supabase, input.playerId, input.requirementId);

  const row: Record<string, unknown> = {
    player_id: input.playerId,
    requirement_id: input.requirementId,
    status: input.status,
    completed_on: completedOn,
    note: input.note.trim() || null,
    marked_by: gate.userId,
  };
  if (input.file !== undefined) {
    row.file_path = input.file?.path ?? null;
    row.file_name = input.file?.name ?? null;
  }

  const { error } = await supabase
    .from("olb_player_requirements")
    .upsert(row, { onConflict: "player_id,requirement_id" });
  if (error) return { error: error.message };

  // A replaced or removed scan is gone for good; best effort.
  if (input.file !== undefined && previous && previous !== input.file?.path) {
    await supabase.storage.from(REQUIREMENT_FILES_BUCKET).remove([previous]);
  }
  refresh();
  return { success: true };
}

// Back to missing: drops the player's record and any scan.
export async function clearPlayerRequirement(playerId: string, requirementId: string): Promise<RequirementResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const previous = await existingFilePath(supabase, playerId, requirementId);
  const { error } = await supabase
    .from("olb_player_requirements")
    .delete()
    .eq("player_id", playerId)
    .eq("requirement_id", requirementId);
  if (error) return { error: error.message };
  if (previous) await supabase.storage.from(REQUIREMENT_FILES_BUCKET).remove([previous]);
  refresh();
  return { success: true };
}

// Throws away a scan that was uploaded but never saved (the dialog was
// cancelled). Only files under this player's folder, and never the one on
// record.
export async function discardRequirementUpload(
  playerId: string,
  requirementId: string,
  path: string
): Promise<RequirementResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!path.startsWith(filePrefix(playerId, requirementId))) return { error: "Not this player's file." };
  const supabase = await createClient();
  if ((await existingFilePath(supabase, playerId, requirementId)) === path) return { success: true };
  const { error } = await supabase.storage.from(REQUIREMENT_FILES_BUCKET).remove([path]);
  if (error) return { error: error.message };
  return { success: true };
}

export async function getRequirementFileUrl(
  playerId: string,
  requirementId: string
): Promise<{ url?: string; error?: string }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const path = await existingFilePath(supabase, playerId, requirementId);
  if (!path) return { error: "No scan is attached." };
  const { data, error } = await supabase.storage
    .from(REQUIREMENT_FILES_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return { error: error?.message ?? "Couldn't open the scan." };
  return { url: data.signedUrl };
}
