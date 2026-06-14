"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { sendProcedureCompletionSlack } from "../notifications/slack";

// Run-completion for a playbook procedure (shutdown wizard).
// Posts the playbook's completion message (FYI, no @-mention) to its configured
// Slack channel. {person} is filled with the runner's name. When started from
// an event (Phase 2a), the FYI also links back to that event. Staff-gated for
// now — Phase 2b narrows this to the assigned/Shutdown-team member.
export async function completeProcedure(
  playbookId: string,
  opts?: { eventId?: string },
): Promise<{ ok: true; posted: boolean } | { error: string }> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data: pb } = await supabase
    .from("playbooks")
    .select("title, wizard_slack_channel, wizard_completion_message")
    .eq("id", playbookId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!pb) return { error: "Playbook not found." };
  const p = pb as { title: string; wizard_slack_channel: string | null; wizard_completion_message: string | null };

  const { data: me } = await supabase
    .from("members")
    .select("full_name")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const person = (me as { full_name: string | null } | null)?.full_name || "A team member";

  // If the run was started from an event, look up its title so the Slack FYI
  // can link back to it.
  let event: { id: string; title: string } | undefined;
  if (opts?.eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("title")
      .eq("id", opts.eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (ev) event = { id: opts.eventId, title: (ev as { title: string }).title };
  }

  let posted = false;
  if (p.wizard_slack_channel) {
    const template = p.wizard_completion_message || `✅ ${p.title} complete — by {person}.`;
    posted = await sendProcedureCompletionSlack({
      channel: p.wizard_slack_channel,
      message: template.replace(/\{person\}/g, person),
      event,
    });
  }
  return { ok: true, posted };
}

export interface PlaybookActionResult {
  success?: boolean;
  error?: string;
  playbookId?: string;
}

export interface PlaybookInput {
  title: string;
  categoryId: string | null;
  excerpt: string | null;
  bodyMd: string;
  // Procedure wizard (0059). steps = ordered checklist labels; empty → not a
  // wizard. wizardSlackChannel/Message drive the FYI posted on completion.
  steps?: string[];
  wizardSlackChannel?: string | null;
  wizardCompletionMessage?: string | null;
}

function validate(input: PlaybookInput): string | null {
  if (!input.title.trim()) return "Title is required.";
  if (input.title.trim().length > 200) return "Title is too long (max 200 characters).";
  return null;
}

// Map the wizard inputs to the playbook columns. Steps store as
// [{label}], blank labels dropped; null when there are none.
function wizardColumns(input: PlaybookInput) {
  const labels = (input.steps ?? []).map((s) => s.trim()).filter(Boolean);
  return {
    steps: labels.length > 0 ? labels.map((label) => ({ label })) : null,
    wizard_slack_channel: input.wizardSlackChannel?.trim() || null,
    wizard_completion_message: input.wizardCompletionMessage?.trim() || null,
  };
}

export async function createPlaybook(
  input: PlaybookInput
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      title: input.title.trim(),
      category_id: input.categoryId,
      excerpt: input.excerpt?.trim() || null,
      body_md: input.bodyMd,
      ...(input.steps !== undefined ? wizardColumns(input) : {}),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create playbook." };

  revalidatePath("/portal/docs");
  return { success: true, playbookId: data.id };
}

export async function updatePlaybook(
  playbookId: string,
  input: PlaybookInput
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const err = validate(input);
  if (err) return { error: err };

  const supabase = await createClient();
  const { error } = await supabase
    .from("playbooks")
    .update({
      title: input.title.trim(),
      category_id: input.categoryId,
      excerpt: input.excerpt?.trim() || null,
      body_md: input.bodyMd,
      ...(input.steps !== undefined ? wizardColumns(input) : {}),
    })
    .eq("id", playbookId);
  if (error) return { error: error.message };

  revalidatePath("/portal/docs");
  revalidatePath(`/portal/docs/${playbookId}`);
  revalidatePath(`/portal/docs/${playbookId}/history`);
  return { success: true };
}

export async function softDeletePlaybook(
  playbookId: string
): Promise<PlaybookActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("playbooks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", playbookId);
  if (error) return { error: error.message };

  revalidatePath("/portal/docs");
  return { success: true };
}
