"use server";

// Planning's writes: sending a season's template to Review, keeping or
// tossing what comes out, ticking tasks off, the template itself, the roles
// (Settings → Planning Roles) and the monthly board meetings. Every one is
// gated by requirePlanner (board + staged rollout); RLS limits the tables to
// the board as well.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requirePlanner } from "./guard";
import { loadMeetingState, type MeetingState } from "./data";
import { seasonTasksFromTemplates } from "./logic";
import {
  changedFields,
  fieldTaskId,
  fieldValue,
  mergeSnapshots,
  type MeetingField,
  type MeetingSnapshot,
} from "./merge";
import { firstDayOf, isMonthKey, type MonthKey } from "./season";
import type { PlanningTemplate, TemplateKind } from "./types";

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
// Several board members can have a meeting open at once. A save sends what
// the page started from (base) and what it has now (mine); the server merges
// that with what's saved now (lib/planning/merge.ts). Parts only one person
// changed combine; a part two people changed differently comes back as a
// conflict and nothing is saved until they choose. Every write only goes
// through if the row is still at the revision it was merged against, so two
// saves racing each other merge instead of one overwriting the other.
// Migration 0105 keeps every saved version (the meeting's History page).

export interface SaveMeetingInput {
  month: MonthKey;
  base: MeetingSnapshot;
  mine: MeetingSnapshot;
}

export type SaveMeetingResult =
  | { error: string }
  | { saved: true; state: MeetingState }
  | { saved: false; conflicts: MeetingField[]; state: MeetingState };

const MAX_TEXT = 100_000;
const MEETING_PARTS = ["meetsOn", "status", "agendaMd", "minutesMd"] as const;

function checkSnapshot(s: MeetingSnapshot): string | null {
  if (s.meetsOn && !YMD.test(s.meetsOn)) return "Pick a date for the meeting.";
  if (!["planned", "held", "skipped"].includes(s.status)) return "Pick how the meeting went.";
  if (s.agendaMd.length > MAX_TEXT || s.minutesMd.length > MAX_TEXT) return "The agenda or minutes are too long to save.";
  const ids = Object.keys(s.notes);
  if (ids.length > 300) return "Too many task notes at once.";
  if (ids.some((id) => !UUID.test(id))) return "A task note doesn't belong to a task.";
  if (Object.values(s.notes).some((n) => n.length > 20_000)) return "One of the task notes is too long.";
  return null;
}

export async function saveMeeting(input: SaveMeetingInput): Promise<SaveMeetingResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!isMonthKey(input.month)) return { error: "Meeting month not found." };
  const bad = checkSnapshot(input.base) ?? checkSnapshot(input.mine);
  if (bad) return { error: bad };
  return writeMeeting(gate.userId, input.month, input.base, input.mine);
}

// Put a meeting's date, status, agenda and minutes back to how an earlier
// version had them. Task notes stay as they are. The restore is itself a new
// version, so it can be undone the same way.
export async function restoreMeetingVersion(month: MonthKey, versionId: string): Promise<SaveMeetingResult> {
  const gate = await requirePlanner();
  if ("error" in gate) return { error: gate.error };
  if (!isMonthKey(month) || !UUID.test(versionId)) return { error: "Version not found." };
  const supabase = await createClient();
  const { data: v } = await supabase
    .from("planning_meeting_versions")
    .select("meets_on, status, agenda_md, minutes_md, meeting:planning_meetings!inner(month)")
    .eq("id", versionId)
    .maybeSingle();
  const version = v as unknown as {
    meets_on: string | null;
    status: MeetingSnapshot["status"];
    agenda_md: string;
    minutes_md: string;
    meeting: { month: string };
  } | null;
  if (!version || version.meeting.month !== firstDayOf(month)) return { error: "Version not found." };
  const { state } = await loadMeetingState(supabase, month);
  const mine = {
    ...state.snapshot,
    meetsOn: version.meets_on ?? "",
    status: version.status,
    agendaMd: version.agenda_md,
    minutesMd: version.minutes_md,
  };
  return writeMeeting(gate.userId, month, state.snapshot, mine);
}

async function writeMeeting(
  userId: string,
  month: MonthKey,
  base: MeetingSnapshot,
  mine: MeetingSnapshot,
): Promise<SaveMeetingResult> {
  const supabase = await createClient();
  // A write that finds the row moved on since it was read merges again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { ok, state } = await loadMeetingState(supabase, month);
    if (!ok) return { error: "Board meetings need migration 0105. Apply it in the Supabase SQL editor." };
    const { merged, conflicts } = mergeSnapshots(base, mine, state.snapshot);
    if (conflicts.length > 0) return { saved: false, conflicts, state };

    const changes = changedFields(state.snapshot, merged);
    if (changes.length === 0 && state.meetingId) return { saved: true, state };
    const fields = {
      meets_on: merged.meetsOn || null,
      status: merged.status,
      agenda_md: merged.agendaMd,
      minutes_md: merged.minutesMd,
      updated_by: userId,
    };

    let meetingId = state.meetingId;
    let raced = false;
    if (!meetingId) {
      const { data, error } = await supabase
        .from("planning_meetings")
        .insert({ month: firstDayOf(month), ...fields, created_by: userId })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505") continue; // someone else saved it first
        return { error: error.message };
      }
      meetingId = (data as { id: string }).id;
    } else if (changes.some((f) => (MEETING_PARTS as readonly string[]).includes(f))) {
      const { data, error } = await supabase
        .from("planning_meetings")
        .update(fields)
        .eq("id", meetingId)
        .eq("revision", state.revision)
        .select("id");
      if (error) return { error: error.message };
      if (!data || data.length === 0) continue;
    }

    for (const f of changes) {
      const taskId = fieldTaskId(f);
      if (!taskId) continue;
      const note = fieldValue(merged, f);
      const rev = state.noteRevisions[taskId];
      if (rev === undefined) {
        if (!note) continue;
        const { error } = await supabase
          .from("planning_meeting_notes")
          .insert({ meeting_id: meetingId, task_id: taskId, note_md: note, updated_by: userId });
        if (error) {
          if (error.code === "23505") raced = true;
          else return { error: error.message };
        }
      } else if (!note) {
        const { data, error } = await supabase
          .from("planning_meeting_notes")
          .delete()
          .eq("meeting_id", meetingId)
          .eq("task_id", taskId)
          .eq("revision", rev)
          .select("task_id");
        if (error) return { error: error.message };
        if (!data || data.length === 0) raced = true;
      } else {
        const { data, error } = await supabase
          .from("planning_meeting_notes")
          .update({ note_md: note, updated_by: userId })
          .eq("meeting_id", meetingId)
          .eq("task_id", taskId)
          .eq("revision", rev)
          .select("task_id");
        if (error) return { error: error.message };
        if (!data || data.length === 0) raced = true;
      }
      revalidatePath(`/portal/tasks/${taskId}`);
    }
    // What's written is now the base; a note that raced merges on the next pass.
    base = merged;
    if (raced) continue;

    revalidatePlanning();
    const after = await loadMeetingState(supabase, month);
    return { saved: true, state: after.state };
  }
  return { error: "The meeting kept changing while saving. Try Save meeting again." };
}
