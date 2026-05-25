"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

export interface AssetActionResult {
  success?: boolean;
  error?: string;
  assetId?: string;
}

export interface AssetInput {
  name: string;
  areaId: string | null;
  type: string | null;
  notes: string | null;
  attributes: Record<string, string>;
}

function validate(input: AssetInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  return null;
}

export async function createAsset(input: AssetInput): Promise<AssetActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      name: input.name.trim(),
      area_id: input.areaId,
      type: input.type?.trim() || null,
      notes: input.notes?.trim() || null,
      attributes: input.attributes ?? {},
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create asset." };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/pm/assets");
  return { success: true, assetId: data.id };
}

export async function updateAsset(
  assetId: string,
  input: AssetInput
): Promise<AssetActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({
      name: input.name.trim(),
      area_id: input.areaId,
      type: input.type?.trim() || null,
      notes: input.notes?.trim() || null,
      attributes: input.attributes ?? {},
    })
    .eq("id", assetId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath(`/portal/pm/assets/${assetId}`);
  return { success: true };
}

export async function softDeleteAsset(assetId: string): Promise<AssetActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/pm/assets");
  return { success: true };
}

function normalizeType(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

export interface RenameTypeResult extends AssetActionResult {
  affected?: number;
  merged?: boolean;
}

export async function renameAssetType(
  oldType: string,
  newTypeRaw: string
): Promise<RenameTypeResult> {
  const newType = normalizeType(newTypeRaw);
  if (!newType) return { error: "New type cannot be empty." };
  if (newType === oldType) return { error: "New type is the same as the old one." };

  const supabase = await createClient();

  // Check whether newType already exists — this becomes a merge.
  const { count: existingCount, error: existingError } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("type", newType);
  if (existingError) return { error: existingError.message };
  const merged = (existingCount ?? 0) > 0;

  // Count assets that will be renamed.
  const { count: affectedCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("type", oldType);

  const { error } = await supabase
    .from("assets")
    .update({ type: newType })
    .eq("type", oldType)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/pm/assets");
  return { success: true, affected: affectedCount ?? 0, merged };
}

export interface ClearTypeResult extends AssetActionResult {
  affected?: number;
}

export async function clearAssetType(oldType: string): Promise<ClearTypeResult> {
  const supabase = await createClient();
  const { count: affectedCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("type", oldType);

  const { error } = await supabase
    .from("assets")
    .update({ type: null })
    .eq("type", oldType)
    .is("deleted_at", null);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/pm/assets");
  return { success: true, affected: affectedCount ?? 0 };
}
