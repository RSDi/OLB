"use server";

// Planning's writes: sending a season's template to Review, keeping or
// tossing what comes out, ticking tasks off, the template itself, the roles
// (Settings → Planning Roles) and the monthly board meetings. Every one is
// gated by requirePlanner (board + staged rollout); RLS limits the tables to
// the board as well.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requirePlanner } from "./guard";
import { seasonTasksFromTemplates } from "./logic";
import { firstDayOf, isMonthKey, type MonthKey } from "./season";
import type { MeetingStatus, PlanningTemplate, TemplateKind } from "./types";

export interface PlanningActionResult {
  success?: boolean;
  error?: string;
}

function revalidatePlanning() {
  // The Planning page and everything under it (the meeting pages), plus
  // Opportunities, where kept tasks also live.
  revalidatePath("/portal/events", "layout");
  revalidatePath("/portal/tasks");
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Seasons and Review ─────────────────────────────────────────────────────

// Copy every monthly task in the template into `season` as a task waiting in
// Review. Safe to run again: a season never gets the same line twice, and
// what the board tossed stays tossed. Lines added to the template later come
// through on the next run.
export async function sendSeasonToReview(
  season: number,
): Promise<PlanningActionResult & { created?: number }> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!Number.isInteger(season) || season < 2000 || season > 2100) return { error: "Pick a season." };

  const supabase = await createClient();
  const { data: tpl, error: tplErr } = await supabase
    .from("planning_templates")
    .select("id, kind, title, notes, month, role_id, playbook_id, sort_order")
    .is("deleted_at", null)
    .eq("kind", "task")
    .not("month", "is", null);
  if (tplErr) return { error: tplErr.message };

  const { data: have, error: haveErr } = await supabase
    .from("maintenance_requests")
    .select("planning_template_id")
    .is("deleted_at", null)
    .eq("planning_season", season)
    .not("planning_template_id", "is", null);
  if (haveErr) return { error: haveErr.message };

  const rows = seasonTasksFromTemplates(
    (tpl as PlanningTemplate[]) ?? [],
    season,
    ((have as { planning_template_id: string }[]) ?? []).map((r) => r.planning_template_id),
  ).map((r) => ({ ...r, submitted_by: gate.userId }));

  if (rows.length > 0) {
    const { error } = await supabase.from("maintenance_requests").insert(rows);
    if (error) {
      // Two people sending the same season at once: the unique index stops
      // the second copy. Running it again picks up anything missed.
      if (error.code === "23505") return { error: "Someone else just sent this season. Refresh to see it." };
      return { error: error.message };
    }
  }
  revalidatePlanning();
  return { success: true, created: rows.length };
}

export type ReviewDecision = "keep" | "toss" | "undo";

// Keep (on the calendar), toss (off it), or send back to Review. Keeping a
// task assigns it to whoever holds its role, unless it's already assigned.
export async function reviewPlanningTasks(
  taskIds: string[],
  decision: ReviewDecision,
): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  const ids = Array.from(new Set(taskIds)).filter((id) => UUID.test(id));
  if (ids.length === 0) return { error: "Nothing to update." };
  if (ids.length > 500) return { error: "Too many at once." };

  const now = new Date().toISOString();
  const patch =
    decision === "keep"
      ? { review_status: "approved", reviewed_by: gate.userId, reviewed_at: now }
      : decision === "toss"
        ? { review_status: "declined", reviewed_by: gate.userId, reviewed_at: now }
        : { review_status: "pending_review", reviewed_by: null, reviewed_at: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update(patch)
    .in("id", ids)
    .not("planning_season", "is", null);
  if (error) return { error: error.message };

  if (decision === "keep") {
    const assignErr = await assignToRoleHolders(supabase, ids);
    if (assignErr) return { error: assignErr };
  }
  revalidatePlanning();
  return { success: true };
}

async function assignToRoleHolders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<string | null> {
  const { data } = await supabase
    .from("maintenance_requests")
    .select("id, template:planning_templates(role:planning_roles(member_id, deleted_at))")
    .in("id", ids)
    .is("assigned_to", null);
  const byMember = new Map<string, string[]>();
  for (const r of (data as unknown as {
    id: string;
    template: { role: { member_id: string | null; deleted_at: string | null } | null } | null;
  }[] | null) ?? []) {
    const role = r.template?.role;
    if (!role?.member_id || role.deleted_at) continue;
    byMember.set(role.member_id, [...(byMember.get(role.member_id) ?? []), r.id]);
  }
  for (const [memberId, taskIds] of byMember) {
    const { error } = await supabase
      .from("maintenance_requests")
      .update({ assigned_to: memberId })
      .in("id", taskIds)
      .is("assigned_to", null);
    if (error) return error.message;
  }
  return null;
}

// Tick a kept task off (or back on) from the calendar or a meeting page.
export async function setPlanningTaskDone(taskId: string, done: boolean): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(taskId)) return { error: "Task not found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("maintenance_requests")
    .update({ status: done ? "done" : "open" })
    .eq("id", taskId)
    .not("planning_season", "is", null);
  if (error) return { error: error.message };
  revalidatePlanning();
  revalidatePath(`/portal/tasks/${taskId}`);
  return { success: true };
}

// ─── The template ───────────────────────────────────────────────────────────

export interface TemplateInput {
  kind: TemplateKind;
  title: string;
  notes: string;
  month: number | null;
  roleId: string | null;
  playbookId: string | null;
  sortOrder: number;
}

function cleanTemplate(input: TemplateInput): { error: string } | { row: Record<string, unknown> } {
  const title = input.title.trim();
  if (!title) return { error: "Give it a title." };
  if (title.length > 300) return { error: "Keep the title under 300 characters." };
  if (input.kind !== "task" && input.kind !== "agenda") return { error: "Pick task or agenda topic." };
  const month = input.month == null ? null : Number(input.month);
  if (month != null && !(Number.isInteger(month) && month >= 1 && month <= 12)) return { error: "Pick a month." };
  if (input.kind === "agenda" && month == null) return { error: "An agenda topic needs a month." };
  const notes = input.notes.trim();
  if (notes.length > 5000) return { error: "Keep the notes under 5,000 characters." };
  return {
    row: {
      kind: input.kind,
      title,
      notes: notes || null,
      month,
      // Agenda topics belong to the whole board.
      role_id: input.kind === "agenda" ? null : input.roleId || null,
      playbook_id: input.playbookId || null,
      sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : 100,
    },
  };
}

export async function createPlanningTemplate(input: TemplateInput): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  const clean = cleanTemplate(input);
  if ("error" in clean) return { error: clean.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("planning_templates")
    .insert({ ...clean.row, created_by: gate.userId });
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

// Changes the template for seasons sent to Review from now on. Seasons already
// built keep their copies; edit those on the task itself.
export async function updatePlanningTemplate(id: string, input: TemplateInput): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(id)) return { error: "Item not found." };
  const clean = cleanTemplate(input);
  if ("error" in clean) return { error: clean.error };
  const supabase = await createClient();
  const { error } = await supabase.from("planning_templates").update(clean.row).eq("id", id);
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

export async function deletePlanningTemplate(id: string): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(id)) return { error: "Item not found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("planning_templates")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

// ─── Roles (Settings → Planning Roles) ──────────────────────────────────────

export interface RoleInput {
  name: string;
  chipClass: string;
  memberId: string | null;
  sortOrder: number;
}

const CHIPS = new Set(["rsd-chip-accent", "rsd-chip-success", "rsd-chip-warn", "rsd-chip-error", "rsd-chip-mute"]);

function cleanRole(input: RoleInput): { error: string } | { row: Record<string, unknown> } {
  const name = input.name.trim();
  if (!name) return { error: "Give the role a name." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  if (input.memberId && !UUID.test(input.memberId)) return { error: "Pick someone from the list." };
  return {
    row: {
      name,
      chip_class: CHIPS.has(input.chipClass) ? input.chipClass : "rsd-chip-mute",
      member_id: input.memberId || null,
      sort_order: Number.isFinite(input.sortOrder) ? Math.round(input.sortOrder) : 100,
    },
  };
}

export async function createPlanningRole(input: RoleInput): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  const clean = cleanRole(input);
  if ("error" in clean) return { error: clean.error };
  const supabase = await createClient();
  const { error } = await supabase.from("planning_roles").insert(clean.row);
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

export async function updatePlanningRole(id: string, input: RoleInput): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(id)) return { error: "Role not found." };
  const clean = cleanRole(input);
  if ("error" in clean) return { error: clean.error };
  const supabase = await createClient();
  const { error } = await supabase.from("planning_roles").update(clean.row).eq("id", id);
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

// The role's template lines and tasks stay; they just show without a role.
export async function deletePlanningRole(id: string): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!UUID.test(id)) return { error: "Role not found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("planning_roles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePlanning();
  return { success: true };
}

// ─── Monthly board meetings ─────────────────────────────────────────────────

export interface MeetingInput {
  month: MonthKey;
  meetsOn: string | null;
  status: MeetingStatus;
  agendaMd: string;
  minutesMd: string;
  // What the meeting said about each task. An empty note clears it.
  notes: { taskId: string; noteMd: string }[];
}

const MAX_TEXT = 100_000;

export async function saveMeeting(input: MeetingInput): Promise<PlanningActionResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!isMonthKey(input.month)) return { error: "Meeting month not found." };
  if (input.meetsOn && !YMD.test(input.meetsOn)) return { error: "Pick a date for the meeting." };
  if (!["planned", "held", "skipped"].includes(input.status)) return { error: "Pick how the meeting went." };
  if (input.agendaMd.length > MAX_TEXT || input.minutesMd.length > MAX_TEXT) {
    return { error: "The agenda or minutes are too long to save." };
  }
  const notes = input.notes.filter((n) => UUID.test(n.taskId));
  if (notes.length > 300) return { error: "Too many task notes at once." };
  if (notes.some((n) => n.noteMd.length > 20_000)) return { error: "One of the task notes is too long." };

  const supabase = await createClient();
  const month = firstDayOf(input.month);
  const fields = {
    meets_on: input.meetsOn || null,
    status: input.status,
    agenda_md: input.agendaMd,
    minutes_md: input.minutesMd,
    updated_by: gate.userId,
  };

  const { data: existing, error: findErr } = await supabase
    .from("planning_meetings")
    .select("id")
    .eq("month", month)
    .maybeSingle();
  if (findErr) return { error: findErr.message };

  let meetingId = (existing as { id: string } | null)?.id ?? null;
  if (meetingId) {
    const { error } = await supabase.from("planning_meetings").update(fields).eq("id", meetingId);
    if (error) return { error: error.message };
  } else {
    const { data: created, error } = await supabase
      .from("planning_meetings")
      .insert({ month, ...fields, created_by: gate.userId })
      .select("id")
      .single();
    if (error) return { error: error.message };
    meetingId = (created as { id: string }).id;
  }

  const keep = notes.filter((n) => n.noteMd.trim());
  const clear = notes.filter((n) => !n.noteMd.trim()).map((n) => n.taskId);
  if (keep.length > 0) {
    const { error } = await supabase.from("planning_meeting_notes").upsert(
      keep.map((n) => ({
        meeting_id: meetingId,
        task_id: n.taskId,
        note_md: n.noteMd.trim(),
        updated_by: gate.userId,
      })),
      { onConflict: "meeting_id,task_id" },
    );
    if (error) return { error: error.message };
  }
  if (clear.length > 0) {
    const { error } = await supabase
      .from("planning_meeting_notes")
      .delete()
      .eq("meeting_id", meetingId)
      .in("task_id", clear);
    if (error) return { error: error.message };
  }

  revalidatePlanning();
  for (const n of notes) revalidatePath(`/portal/tasks/${n.taskId}`);
  return { success: true };
}
