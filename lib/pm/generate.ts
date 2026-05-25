// Shared PM instance generation logic.
//
// Both the server action `createNextInstance` (user-context server client) and
// the cron handler (admin client, no user) call into this. Pure function with
// no revalidatePath / redirect — callers handle side effects.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNextScheduledFor, type ScheduleKind } from "./schedule";

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

export interface GenerateOptions {
  overrideScheduledFor?: string;
  today?: Date;
}

export interface GenerateResult {
  instanceId?: string;
  error?: string;
}

export async function generatePmInstance(
  supabase: SupabaseClient,
  templateId: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { data: template, error: templateError } = await supabase
    .from("pm_templates")
    .select(
      "title, description, area_id, priority_id, schedule_kind, schedule_value, steps, asset_type, per_asset"
    )
    .eq("id", templateId)
    .is("deleted_at", null)
    .maybeSingle();
  if (templateError) return { error: templateError.message };
  if (!template) return { error: "Template not found." };

  const { data: lastDone } = await supabase
    .from("pm_instances")
    .select("completed_at")
    .eq("template_id", templateId)
    .eq("status", "done")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scheduledFor =
    options.overrideScheduledFor ??
    computeNextScheduledFor({
      kind: template.schedule_kind as ScheduleKind,
      value: template.schedule_value as number,
      lastCompletedAt: lastDone?.completed_at ? new Date(lastDone.completed_at) : null,
      today: options.today,
    })
      .toISOString()
      .slice(0, 10);

  const steps = (template.steps as TemplateStep[]) ?? [];
  const assetType = (template.asset_type as string | null) ?? null;
  const assetScoped = Boolean(template.per_asset);

  let assetIds: string[] = [];
  if (assetScoped) {
    let assetsQuery = supabase.from("assets").select("id").is("deleted_at", null);
    if (template.area_id) assetsQuery = assetsQuery.eq("area_id", template.area_id);
    if (assetType) assetsQuery = assetsQuery.eq("type", assetType);
    const { data: matchingAssets, error: assetsError } = await assetsQuery;
    if (assetsError) return { error: assetsError.message };
    assetIds = (matchingAssets ?? []).map((a) => a.id);
    if (assetIds.length === 0) {
      const where = [
        template.area_id ? "in the template's area" : null,
        assetType ? `of type "${assetType}"` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return {
        error: `No active assets ${where || "match this template"}. Add some assets in Settings → Assets first.`,
      };
    }
  }

  const parentStepChecks: InstanceStepCheck[] = assetScoped
    ? []
    : steps.map((s) => ({
        step_id: s.id,
        checked: false,
        checked_at: null,
        checked_by: null,
      }));

  const { data: instance, error: insertError } = await supabase
    .from("pm_instances")
    .insert({
      template_id: templateId,
      title: template.title,
      description: template.description,
      area_id: template.area_id,
      priority_id: template.priority_id,
      scheduled_for: scheduledFor,
      status: "pending",
      step_checks: parentStepChecks,
    })
    .select("id")
    .single();
  if (insertError || !instance) {
    return { error: insertError?.message ?? "Failed to create instance." };
  }

  if (assetScoped && assetIds.length > 0) {
    const subRows = assetIds.map((assetId) => ({
      instance_id: instance.id,
      asset_id: assetId,
      step_checks: steps.map((s) => ({
        step_id: s.id,
        checked: false,
        checked_at: null,
        checked_by: null,
      })),
      status: "pending" as const,
    }));
    const { error: subError } = await supabase.from("pm_instance_assets").insert(subRows);
    if (subError) {
      // Roll back the parent row so we don't leave an orphan.
      await supabase.from("pm_instances").delete().eq("id", instance.id);
      return { error: subError.message };
    }
  }

  return { instanceId: instance.id };
}
