"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

export interface SupplyActionResult {
  success?: boolean;
  error?: string;
  supplyId?: string;
}

export interface SupplyInput {
  name: string;
  unit: string;
  onHand: number;
  reorderThreshold: number;
  notes: string | null;
}

function validate(input: SupplyInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.unit.trim()) return "Unit is required.";
  if (!Number.isFinite(input.onHand) || input.onHand < 0) return "On-hand quantity must be 0 or more.";
  if (!Number.isFinite(input.reorderThreshold) || input.reorderThreshold < 0) {
    return "Reorder threshold must be 0 or more.";
  }
  return null;
}

export async function createSupply(input: SupplyInput): Promise<SupplyActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplies")
    .insert({
      name: input.name.trim(),
      unit: input.unit.trim(),
      on_hand: input.onHand,
      reorder_threshold: input.reorderThreshold,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create supply." };

  revalidatePath("/portal/settings");
  revalidatePath("/portal");
  return { success: true, supplyId: data.id };
}

export async function updateSupply(
  supplyId: string,
  input: SupplyInput
): Promise<SupplyActionResult> {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplies")
    .update({
      name: input.name.trim(),
      unit: input.unit.trim(),
      on_hand: input.onHand,
      reorder_threshold: input.reorderThreshold,
      notes: input.notes?.trim() || null,
    })
    .eq("id", supplyId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal");
  return { success: true };
}

export async function softDeleteSupply(supplyId: string): Promise<SupplyActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplies")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", supplyId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal");
  return { success: true };
}

// --- Asset ↔ supply linking ------------------------------------------------

export interface LinkActionResult {
  success?: boolean;
  error?: string;
}

export async function linkSupplyToAsset(
  assetId: string,
  supplyId: string,
  qtyPerUse: number,
  notes: string | null
): Promise<LinkActionResult> {
  if (!Number.isFinite(qtyPerUse) || qtyPerUse <= 0) {
    return { error: "Qty per use must be greater than 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_supplies")
    .upsert(
      {
        asset_id: assetId,
        supply_id: supplyId,
        qty_per_use: qtyPerUse,
        notes: notes?.trim() || null,
      },
      { onConflict: "asset_id,supply_id" }
    );
  if (error) return { error: error.message };

  revalidatePath(`/portal/pm/assets/${assetId}`);
  return { success: true };
}

export async function unlinkSupplyFromAsset(
  assetId: string,
  supplyId: string
): Promise<LinkActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_supplies")
    .delete()
    .eq("asset_id", assetId)
    .eq("supply_id", supplyId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/pm/assets/${assetId}`);
  return { success: true };
}

// --- Usage logging --------------------------------------------------------

export interface RecordUsageInput {
  supplyId: string;
  qtyUsed: number;
  pmInstanceAssetId?: string;
  pmInstanceId?: string;
  maintenanceRequestId?: string;
  notes?: string | null;
}

export interface RecordUsageResult {
  success?: boolean;
  error?: string;
  newOnHand?: number;
}

export async function recordSupplyUsage(
  input: RecordUsageInput
): Promise<RecordUsageResult> {
  if (!Number.isFinite(input.qtyUsed) || input.qtyUsed <= 0) {
    return { error: "Quantity used must be greater than 0." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: me } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me) return { error: "Member record not found." };

  // Atomic decrement via RPC (defined in migration 0012). Floors at 0.
  const { data: newOnHand, error: rpcError } = await supabase.rpc("decrement_supply", {
    p_supply_id: input.supplyId,
    p_qty: input.qtyUsed,
  });
  if (rpcError) return { error: rpcError.message };

  // Audit log.
  const { error: logError } = await supabase.from("supply_usage").insert({
    supply_id: input.supplyId,
    qty_used: input.qtyUsed,
    used_by: me.id,
    pm_instance_asset_id: input.pmInstanceAssetId ?? null,
    pm_instance_id: input.pmInstanceId ?? null,
    maintenance_request_id: input.maintenanceRequestId ?? null,
    notes: input.notes?.trim() || null,
  });
  if (logError) {
    // Inventory already decremented. Surface error but don't try to undo.
    console.error("[supplies] decrement succeeded, log failed:", logError);
    return { error: `Logged usage but audit insert failed: ${logError.message}` };
  }

  revalidatePath("/portal");
  revalidatePath("/portal/settings");
  return { success: true, newOnHand: newOnHand as number };
}
