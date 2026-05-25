"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { generatePmInstance } from "./generate";
import { type ScheduleKind } from "./schedule";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

export interface TemplateStep {
  id: string;
  label: string;
}

export interface InstanceStepCheck {
  step_id: string;
  checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
}

export type InstanceStatus = "pending" | "in_progress" | "done" | "skipped";

interface TemplateInput {
  title: string;
  description: string | null;
  areaId: string | null;
  priorityId: string | null;
  scheduleKind: ScheduleKind;
  scheduleValue: number;
  steps: string[];
  active: boolean;
  perAsset: boolean;
  assetType: string | null;
}

function normalizeSteps(labels: string[]): TemplateStep[] {
  return labels
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label) => ({ id: randomUUID(), label }));
}

function validateInput(input: TemplateInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (!input.scheduleKind) return "Schedule is required.";
  if (input.scheduleKind === "monthly_day" && (input.scheduleValue < 1 || input.scheduleValue > 28)) {
    return "Day of month must be 1–28.";
  }
  if (input.scheduleKind === "weekly_day" && (input.scheduleValue < 0 || input.scheduleValue > 6)) {
    return "Day of week must be 0–6.";
  }
  if (input.scheduleKind === "after_completion_days" && input.scheduleValue < 1) {
    return "Interval must be at least 1 day.";
  }
  if (input.perAsset && !input.areaId && !input.assetType?.trim()) {
    return "Per-asset templates need at least an area or an asset type to limit which assets get sub-tasks.";
  }
  return null;
}

export async function createTemplate(
  input: TemplateInput
): Promise<ActionResult & { templateId?: string }> {
  const err = validateInput(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pm_templates")
    .insert({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      area_id: input.areaId,
      priority_id: input.priorityId,
      schedule_kind: input.scheduleKind,
      schedule_value: input.scheduleValue,
      steps: normalizeSteps(input.steps),
      active: input.active,
      per_asset: input.perAsset,
      asset_type: input.perAsset ? input.assetType?.trim() || null : null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create template." };

  revalidatePath("/portal/pm/templates");
  return { success: true, templateId: data.id };
}

export async function updateTemplate(
  templateId: string,
  input: TemplateInput
): Promise<ActionResult> {
  const err = validateInput(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_templates")
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      area_id: input.areaId,
      priority_id: input.priorityId,
      schedule_kind: input.scheduleKind,
      schedule_value: input.scheduleValue,
      steps: normalizeSteps(input.steps),
      active: input.active,
      per_asset: input.perAsset,
      asset_type: input.perAsset ? input.assetType?.trim() || null : null,
    })
    .eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/portal/pm/templates");
  revalidatePath(`/portal/pm/templates/${templateId}/edit`);
  return { success: true };
}

export async function softDeleteTemplate(templateId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/portal/pm/templates");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function restorePmTemplate(templateId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_templates")
    .update({ deleted_at: null })
    .eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/portal/pm/templates");
  revalidatePath("/portal/settings");
  return { success: true };
}

export async function hardDeletePmTemplate(templateId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // ON DELETE CASCADE in migration 0008 will also remove every pm_instance
  // that referenced this template (and their pm_instance_assets sub-rows).
  // Callers must warn the user before reaching this action.
  const { error } = await supabase.from("pm_templates").delete().eq("id", templateId);
  if (error) return { error: error.message };

  revalidatePath("/portal/pm");
  revalidatePath("/portal/pm/templates");
  revalidatePath("/portal/settings");
  return { success: true };
}

interface CreateNextInstanceArgs {
  templateId: string;
  overrideScheduledFor?: string;
}

export async function createNextInstance({
  templateId,
  overrideScheduledFor,
}: CreateNextInstanceArgs): Promise<ActionResult & { instanceId?: string }> {
  const supabase = await createClient();
  const result = await generatePmInstance(supabase, templateId, { overrideScheduledFor });
  if (result.error) return { error: result.error };

  revalidatePath("/portal/pm");
  revalidatePath("/portal/pm/templates");
  return { success: true, instanceId: result.instanceId };
}

export async function toggleStep(
  instanceId: string,
  stepId: string,
  checked: boolean
): Promise<ActionResult> {
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

  const { data: instance, error: fetchError } = await supabase
    .from("pm_instances")
    .select("step_checks, status")
    .eq("id", instanceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!instance) return { error: "Instance not found." };

  const checks = (instance.step_checks as InstanceStepCheck[]) ?? [];
  const next = checks.map((c) =>
    c.step_id === stepId
      ? {
          ...c,
          checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? me.id : null,
        }
      : c
  );

  // Auto-advance pending → in_progress on first check.
  const nextStatus =
    instance.status === "pending" && checked && next.some((c) => c.checked)
      ? "in_progress"
      : instance.status;

  const { error: updateError } = await supabase
    .from("pm_instances")
    .update({ step_checks: next, status: nextStatus })
    .eq("id", instanceId);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/portal/pm/${instanceId}`);
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function completeInstance(
  instanceId: string,
  notes: string | null
): Promise<ActionResult> {
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

  const { error } = await supabase
    .from("pm_instances")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: me.id,
      notes: notes?.trim() || null,
    })
    .eq("id", instanceId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/pm/${instanceId}`);
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function skipInstance(
  instanceId: string,
  reason: string | null
): Promise<ActionResult> {
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

  const { error } = await supabase
    .from("pm_instances")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_by: me.id,
      notes: reason?.trim() || null,
    })
    .eq("id", instanceId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/pm/${instanceId}`);
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function reopenInstance(instanceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_instances")
    .update({
      status: "in_progress",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", instanceId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/pm/${instanceId}`);
  revalidatePath("/portal/pm");
  return { success: true };
}

// --- Asset-scoped instance flow ---------------------------------------------
//
// For templates with asset_type set, the instance fans out into one
// pm_instance_assets row per matching asset. Each asset is completed
// independently; the parent instance's status is recomputed after every
// per-asset change.

async function recomputeParentStatus(
  supabase: SupabaseClient,
  parentId: string
): Promise<void> {
  const { data: subs } = await supabase
    .from("pm_instance_assets")
    .select("status")
    .eq("instance_id", parentId);
  const rows = (subs as { status: InstanceStatus }[]) ?? [];
  if (rows.length === 0) return;

  const allDone = rows.every((r) => r.status === "done" || r.status === "skipped");
  const anyStarted = rows.some((r) => r.status !== "pending");
  const nextStatus: InstanceStatus = allDone ? "done" : anyStarted ? "in_progress" : "pending";

  await supabase
    .from("pm_instances")
    .update({
      status: nextStatus,
      completed_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", parentId);
}

async function getParentIdForAssetRow(
  supabase: SupabaseClient,
  instanceAssetId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("pm_instance_assets")
    .select("instance_id")
    .eq("id", instanceAssetId)
    .maybeSingle();
  return (data?.instance_id as string | undefined) ?? null;
}

export async function toggleAssetStep(
  instanceAssetId: string,
  stepId: string,
  checked: boolean
): Promise<ActionResult> {
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

  const { data: row, error: fetchError } = await supabase
    .from("pm_instance_assets")
    .select("instance_id, step_checks, status")
    .eq("id", instanceAssetId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  if (!row) return { error: "Asset task not found." };

  const checks = (row.step_checks as InstanceStepCheck[]) ?? [];
  const next = checks.map((c) =>
    c.step_id === stepId
      ? {
          ...c,
          checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? me.id : null,
        }
      : c
  );

  const nextStatus: InstanceStatus =
    row.status === "pending" && checked && next.some((c) => c.checked)
      ? "in_progress"
      : (row.status as InstanceStatus);

  const { error: updateError } = await supabase
    .from("pm_instance_assets")
    .update({ step_checks: next, status: nextStatus })
    .eq("id", instanceAssetId);
  if (updateError) return { error: updateError.message };

  await recomputeParentStatus(supabase, row.instance_id as string);

  revalidatePath(`/portal/pm/${row.instance_id}`);
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function completeAssetInstance(
  instanceAssetId: string,
  notes: string | null
): Promise<ActionResult> {
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

  const { error } = await supabase
    .from("pm_instance_assets")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: me.id,
      notes: notes?.trim() || null,
    })
    .eq("id", instanceAssetId);
  if (error) return { error: error.message };

  const parentId = await getParentIdForAssetRow(supabase, instanceAssetId);
  if (parentId) {
    await recomputeParentStatus(supabase, parentId);
    revalidatePath(`/portal/pm/${parentId}`);
  }
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function skipAssetInstance(
  instanceAssetId: string,
  reason: string | null
): Promise<ActionResult> {
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

  const { error } = await supabase
    .from("pm_instance_assets")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_by: me.id,
      notes: reason?.trim() || null,
    })
    .eq("id", instanceAssetId);
  if (error) return { error: error.message };

  const parentId = await getParentIdForAssetRow(supabase, instanceAssetId);
  if (parentId) {
    await recomputeParentStatus(supabase, parentId);
    revalidatePath(`/portal/pm/${parentId}`);
  }
  revalidatePath("/portal/pm");
  return { success: true };
}

export async function reopenAssetInstance(instanceAssetId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("pm_instance_assets")
    .update({
      status: "in_progress",
      completed_at: null,
      completed_by: null,
    })
    .eq("id", instanceAssetId);
  if (error) return { error: error.message };

  const parentId = await getParentIdForAssetRow(supabase, instanceAssetId);
  if (parentId) {
    await recomputeParentStatus(supabase, parentId);
    revalidatePath(`/portal/pm/${parentId}`);
  }
  revalidatePath("/portal/pm");
  return { success: true };
}
