"use server";

import { revalidatePath } from "next/cache";
import { requireApproved, requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { sendProcedureCompletionSlack } from "../notifications/slack";
import { memberDisplayName } from "../members/display";

export interface ProcedureActionResult {
  success?: boolean;
  error?: string;
  procedureId?: string;
}

export interface ProcedureInput {
  title: string;
  steps: string[];
  notify: boolean;
  slackChannel: string | null;
  completionMessage: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shared column mapping: step labels → [{label}], blanks dropped; notify config.
function procedureColumns(input: ProcedureInput) {
  const labels = (input.steps ?? []).map(s => s.trim()).filter(Boolean);
  return {
    title: input.title.trim() || "Procedure",
    steps: labels.map(label => ({ label })),
    notify: !!input.notify,
    // Persist the channel as a saved preference regardless of the notify
    // toggle — posting is gated on (notify && slack_channel) at every call
    // site, so nulling it here would just silently lose a configured value
    // when someone toggles notify off and back on.
    slack_channel: input.slackChannel?.trim() || null,
    completion_message: input.completionMessage?.trim() || null,
  };
}

export async function createProcedure(
  playbookId: string,
  input: ProcedureInput,
): Promise<ProcedureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!UUID_RE.test(playbookId)) return { error: "Invalid playbook." };

  const supabase = await createClient();
  // Append after the existing procedures.
  const { data: last } = await supabase
    .from("playbook_procedures")
    .select("sort_order")
    .eq("playbook_id", playbookId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((last as { sort_order: number } | null)?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("playbook_procedures")
    .insert({ playbook_id: playbookId, sort_order: nextOrder, ...procedureColumns(input) })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to add procedure." };

  revalidatePath(`/portal/docs/${playbookId}`);
  return { success: true, procedureId: (data as { id: string }).id };
}

export async function updateProcedure(
  procedureId: string,
  playbookId: string,
  input: ProcedureInput,
): Promise<ProcedureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!UUID_RE.test(procedureId)) return { error: "Invalid procedure." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("playbook_procedures")
    .update(procedureColumns(input))
    .eq("id", procedureId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/docs/${playbookId}`);
  return { success: true };
}

// Soft-delete a procedure. Uses the admin client with an app-layer staff gate
// (the RLS update policy disallows setting deleted_at for non-super staff).
export async function deleteProcedure(
  procedureId: string,
  playbookId: string,
): Promise<ProcedureActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (!UUID_RE.test(procedureId)) return { error: "Invalid procedure." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("playbook_procedures")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", procedureId);
  if (error) return { error: error.message };

  revalidatePath(`/portal/docs/${playbookId}`);
  return { success: true };
}

// Run-completion for a standalone procedure (from the playbook page). ALWAYS
// logs a procedure_runs row (the history); posts a Slack FYI only when the
// procedure has notify on + a channel. {person} is the runner's name.
// Any approved member can run one; the run row goes in via the admin client,
// so procedure_runs needs no member insert policy.
export async function completeProcedure(
  procedureId: string,
  opts?: { eventId?: string },
): Promise<{ ok: true; posted: boolean } | { error: string }> {
  const gate = await requireApproved();
  if ("error" in gate) return { error: gate.error };
  if (!UUID_RE.test(procedureId)) return { error: "Invalid procedure." };

  const supabase = await createClient();
  const { data: proc } = await supabase
    .from("playbook_procedures")
    .select("id, playbook_id, title, notify, slack_channel, completion_message")
    .eq("id", procedureId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!proc) return { error: "Procedure not found." };
  const p = proc as {
    id: string; playbook_id: string; title: string;
    notify: boolean; slack_channel: string | null; completion_message: string | null;
  };

  const { data: me } = await supabase
    .from("members")
    .select("id, full_name, nickname")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const meRow = me as { id: string; full_name: string | null; nickname: string | null } | null;
  const person = (meRow ? memberDisplayName(meRow) : "") || "A team member";

  // Optional event link, for the Slack FYI back-reference.
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
  if (p.notify && p.slack_channel) {
    const template = p.completion_message || `✅ ${p.title} complete — by {person}.`;
    posted = await sendProcedureCompletionSlack({
      channel: p.slack_channel,
      message: template.replace(/\{person\}/g, person),
      event,
    });
  }

  // Always log the run (this is the "just log it as done" history).
  const admin = createAdminClient();
  const { error: runErr } = await admin.from("procedure_runs").insert({
    procedure_id: procedureId,
    ran_by: meRow?.id ?? null,
    ran_by_name: person,
    notified: posted,
    source: "playbook",
  });
  if (runErr) console.error("procedure_runs insert failed", runErr);

  revalidatePath(`/portal/docs/${p.playbook_id}`);
  return { ok: true, posted };
}
