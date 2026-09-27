"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { isStaff, type MemberRole, type MemberStatus } from "../auth/permissions";
import {
  sendShutdownAssignedSlack,
  sendShutdownCoverRequestSlack,
  sendProcedureCompletionSlack,
  type SlackEventRef,
} from "../notifications/slack";
import { memberDisplayName } from "../members/display";

// Building-shutdown wizard, Phase 2b. A shutdown is a maintenance_requests row
// linked to its event (event_id) and assigned to a Building Shutdown team
// member. Staff assign it; the assignee runs the checklist from their task and
// completes it, or opts out to ask the team for cover. Writes use the admin
// client so a non-staff assignee can act on their own task without opening up
// broad RLS — gating is enforced here in the app layer.

interface ActionResult {
  success?: boolean;
  error?: string;
  taskId?: string;
}

interface CallerCtx {
  userId: string;
  memberId: string | null;
  displayName: string | null;
  staff: boolean;
}

async function callerContext(): Promise<CallerCtx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("id, full_name, nickname, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const m = data as {
    id: string;
    full_name: string | null;
    nickname: string | null;
    role: MemberRole;
    status: MemberStatus;
  } | null;
  return {
    userId: user.id,
    memberId: m?.id ?? null,
    displayName: m ? memberDisplayName(m) : null,
    staff: isStaff(m),
  };
}

function whenLabel(startAt: string | null): string | undefined {
  if (!startAt) return undefined;
  return new Date(startAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface EventWithProc {
  id: string;
  title: string;
  start_at: string | null;
  procedureId: string | null;
  notify: boolean;
  channel: string | null;
  completionMessage: string | null;
  procedureTitle: string | null;
}

// Load an event plus its linked shutdown procedure's notify config (0066).
async function loadEventProc(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<EventWithProc | null> {
  const { data: ev } = await admin
    .from("events")
    .select("id, title, start_at, shutdown_procedure_id")
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ev) return null;
  const e = ev as { id: string; title: string; start_at: string | null; shutdown_procedure_id: string | null };

  let notify = false;
  let channel: string | null = null;
  let completionMessage: string | null = null;
  let procedureTitle: string | null = null;
  if (e.shutdown_procedure_id) {
    const { data: pp } = await admin
      .from("playbook_procedures")
      .select("title, notify, slack_channel, completion_message")
      .eq("id", e.shutdown_procedure_id)
      .is("deleted_at", null)
      .maybeSingle();
    const p = pp as { title: string; notify: boolean; slack_channel: string | null; completion_message: string | null } | null;
    notify = !!p?.notify;
    channel = p?.slack_channel ?? null;
    completionMessage = p?.completion_message ?? null;
    procedureTitle = p?.title ?? null;
  }
  return {
    id: e.id,
    title: e.title,
    start_at: e.start_at,
    procedureId: e.shutdown_procedure_id,
    notify,
    channel,
    completionMessage,
    procedureTitle,
  };
}

function eventRef(e: EventWithProc): SlackEventRef {
  return { id: e.id, title: e.title, whenLabel: whenLabel(e.start_at) };
}

// Assign (or reassign) the shutdown for an event to a team member. Creates the
// shutdown task on first assignment. Staff-gated.
export async function assignShutdown(eventId: string, memberId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();

  const ev = await loadEventProc(admin, eventId);
  if (!ev) return { error: "Event not found." };
  if (!ev.procedureId) return { error: "This event has no shutdown procedure linked." };

  // Confirm the assignee exists and is on the Building Shutdown team.
  const { data: assignee } = await admin
    .from("members")
    .select("id, full_name, nickname")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!assignee) return { error: "That member no longer exists." };
  const assigneeName =
    memberDisplayName(assignee as { full_name: string | null; nickname: string | null }) || "A team member";

  // Find an existing (non-deleted) shutdown task for this event.
  const { data: existing } = await admin
    .from("maintenance_requests")
    .select("id")
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  let taskId: string;
  if (existing) {
    taskId = (existing as { id: string }).id;
    const { error } = await admin
      .from("maintenance_requests")
      .update({ assigned_to: memberId, status: "open" })
      .eq("id", taskId);
    if (error) return { error: error.message };
  } else {
    // Look up the shutdown category + a routine priority by name.
    const [{ data: cat }, { data: prio }] = await Promise.all([
      admin.from("task_categories").select("id").ilike("name", "Building Shutdown").is("deleted_at", null).maybeSingle(),
      admin.from("priorities").select("id").eq("label", "Low").maybeSingle(),
    ]);
    // occurrence_date keeps a one-off shutdown task consistent with the
    // generator's per-occurrence rows (and the unique index).
    const occurrenceDate = ev.start_at ? new Date(ev.start_at).toISOString().slice(0, 10) : null;
    const { data: created, error } = await admin
      .from("maintenance_requests")
      .insert({
        description: `Building shutdown — ${ev.title}`,
        status: "open",
        review_status: "approved",
        submitted_by: gate.userId,
        assigned_to: memberId,
        event_id: eventId,
        occurrence_date: occurrenceDate,
        category_id: (cat as { id: string } | null)?.id ?? null,
        priority_id: (prio as { id: string } | null)?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Couldn't create the shutdown task." };
    taskId = (created as { id: string }).id;
  }

  if (ev.notify && ev.channel) {
    await sendShutdownAssignedSlack({ channel: ev.channel, assigneeName, event: eventRef(ev) });
  }

  revalidatePath(`/portal/events/${eventId}/edit`);
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${taskId}`);
  return { success: true, taskId };
}

// Assign a specific shutdown task (e.g. a cron-generated occurrence) to a team
// member. Staff-gated. Mirrors assignShutdown but targets the task directly,
// since a recurring event has many per-occurrence tasks.
export async function assignShutdownTask(taskId: string, memberId: string): Promise<ActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const admin = createAdminClient();

  const { data: task } = await admin
    .from("maintenance_requests")
    .select("id, event_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { error: "Shutdown task not found." };
  const t = task as { id: string; event_id: string | null };

  const { data: assignee } = await admin
    .from("members")
    .select("full_name, nickname")
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!assignee) return { error: "That member no longer exists." };
  const assigneeName =
    memberDisplayName(assignee as { full_name: string | null; nickname: string | null }) || "A team member";

  const { error } = await admin
    .from("maintenance_requests")
    .update({ assigned_to: memberId, status: "open" })
    .eq("id", taskId);
  if (error) return { error: error.message };

  if (t.event_id) {
    const ev = await loadEventProc(admin, t.event_id);
    if (ev?.notify && ev.channel) {
      await sendShutdownAssignedSlack({ channel: ev.channel, assigneeName, event: eventRef(ev) });
    }
  }
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${taskId}`);
  return { success: true, taskId };
}

// The assignee (or staff) bows out: unassign the task and ask the team to cover.
export async function optOutShutdown(taskId: string): Promise<ActionResult> {
  const caller = await callerContext();
  if (!caller) return { error: "You must be signed in." };
  const admin = createAdminClient();

  const { data: task } = await admin
    .from("maintenance_requests")
    .select("id, assigned_to, event_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { error: "Shutdown task not found." };
  const t = task as { id: string; assigned_to: string | null; event_id: string | null };

  const isAssignee = caller.memberId !== null && caller.memberId === t.assigned_to;
  if (!caller.staff && !isAssignee) {
    return { error: "Only the assignee or the board can do that." };
  }

  // Capture the former assignee's name for the cover request.
  let formerName: string | null = null;
  if (t.assigned_to) {
    const { data: m } = await admin
      .from("members")
      .select("full_name, nickname")
      .eq("id", t.assigned_to)
      .maybeSingle();
    formerName = m ? memberDisplayName(m as { full_name: string | null; nickname: string | null }) : null;
  }

  const { error } = await admin
    .from("maintenance_requests")
    .update({ assigned_to: null, status: "open" })
    .eq("id", taskId);
  if (error) return { error: error.message };

  if (t.event_id) {
    const ev = await loadEventProc(admin, t.event_id);
    if (ev?.notify && ev.channel) {
      await sendShutdownCoverRequestSlack({ channel: ev.channel, formerAssigneeName: formerName, event: eventRef(ev) });
    }
    revalidatePath(`/portal/events/${t.event_id}/edit`);
  }
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${taskId}`);
  return { success: true };
}

// Finish the shutdown: mark the task done and post the completion FYI (with the
// event link). The assignee or staff may complete it.
export async function completeShutdownTask(
  taskId: string,
): Promise<{ ok: true; posted: boolean } | { error: string }> {
  const caller = await callerContext();
  if (!caller) return { error: "You must be signed in." };
  const admin = createAdminClient();

  const { data: task } = await admin
    .from("maintenance_requests")
    .select("id, assigned_to, event_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return { error: "Shutdown task not found." };
  const t = task as { id: string; assigned_to: string | null; event_id: string | null };

  const isAssignee = caller.memberId !== null && caller.memberId === t.assigned_to;
  if (!caller.staff && !isAssignee) {
    return { error: "Only the assignee or the board can complete this." };
  }
  if (!t.event_id) return { error: "This task isn't linked to an event." };

  const ev = await loadEventProc(admin, t.event_id);
  if (!ev) return { error: "The linked event no longer exists." };

  const { error } = await admin
    .from("maintenance_requests")
    .update({ status: "done" })
    .eq("id", taskId);
  if (error) return { error: error.message };

  const person = caller.displayName || "A team member";
  let posted = false;
  if (ev.notify && ev.channel) {
    const template = ev.completionMessage || `✅ ${ev.procedureTitle ?? "Building shutdown"} complete — by {person}.`;
    posted = await sendProcedureCompletionSlack({
      channel: ev.channel,
      message: template.replace(/\{person\}/g, person),
      event: eventRef(ev),
    });
  }

  // Log the run against the procedure (the history), like a standalone run.
  if (ev.procedureId) {
    const { error: runErr } = await admin.from("procedure_runs").insert({
      procedure_id: ev.procedureId,
      ran_by: caller.memberId,
      ran_by_name: person,
      notified: posted,
      source: "task",
    });
    if (runErr) console.error("procedure_runs insert failed", runErr);
  }

  revalidatePath(`/portal/events/${t.event_id}/edit`);
  revalidatePath("/portal/tasks");
  revalidatePath(`/portal/tasks/${taskId}`);
  return { ok: true, posted };
}
