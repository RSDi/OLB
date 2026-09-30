// Planning's reads, for the server pages. Each returns `ok: false` instead of
// throwing when the query fails, which before migration 0104 is every one of
// them, so the page can say so instead of breaking.

import type { SupabaseClient } from "@supabase/supabase-js";
import { memberDisplayName } from "../members/display";
import { splitDescription, taskMonth } from "./logic";
import type { MeetingSnapshot } from "./merge";
import { firstDayOf, monthKeyOf, type MonthKey } from "./season";
import type {
  PlanningMeeting,
  PlanningRole,
  PlanningTask,
  PlanningTemplate,
  PlaybookLink,
  ReviewStatus,
  TaskStatus,
} from "./types";

interface TaskRow {
  id: string;
  description: string;
  status: TaskStatus;
  review_status: ReviewStatus;
  start_on: string | null;
  due_on: string | null;
  planning_season: number;
  template: {
    month: number | null;
    sort_order: number;
    role: { id: string; name: string; chip_class: string; deleted_at: string | null } | null;
    playbook: { id: string; title: string; deleted_at: string | null } | null;
  } | null;
  assignee: { full_name: string | null; nickname: string | null; email: string } | null;
}

const TASK_SELECT = `id, description, status, review_status, start_on, due_on, planning_season,
  template:planning_templates(month, sort_order,
    role:planning_roles(id, name, chip_class, deleted_at),
    playbook:playbooks(id, title, deleted_at)),
  assignee:members!assigned_to(full_name, nickname, email)`;

function toTask(r: TaskRow): PlanningTask | null {
  const month = taskMonth({
    due_on: r.due_on,
    start_on: r.start_on,
    planning_season: r.planning_season,
    template_month: r.template?.month ?? null,
  });
  if (!month) return null;
  const { title, notes } = splitDescription(r.description);
  const role = r.template?.role && !r.template.role.deleted_at ? r.template.role : null;
  const playbook = r.template?.playbook && !r.template.playbook.deleted_at ? r.template.playbook : null;
  return {
    id: r.id,
    title,
    notes,
    status: r.status,
    reviewStatus: r.review_status,
    season: r.planning_season,
    month,
    dueOn: r.due_on,
    role: role ? { id: role.id, name: role.name, chip_class: role.chip_class } : null,
    playbook: playbook ? { id: playbook.id, title: playbook.title } : null,
    assignee: r.assignee ? memberDisplayName(r.assignee) : null,
    sortOrder: r.template?.sort_order ?? 1000,
  };
}

// Every season's tasks in the given review states, oldest month first.
export async function loadPlanningTasks(
  supabase: SupabaseClient,
  reviewStatuses: ReviewStatus[],
): Promise<{ ok: boolean; tasks: PlanningTask[] }> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select(TASK_SELECT)
    .is("deleted_at", null)
    .is("parent_id", null)
    .not("planning_season", "is", null)
    .in("review_status", reviewStatuses)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, tasks: [] };
  const tasks = ((data as unknown as TaskRow[]) ?? [])
    .map(toTask)
    .filter((t): t is PlanningTask => t !== null);
  return { ok: true, tasks: sortTasks(tasks) };
}

// Month, then role order as Settings lists them (by name as the fallback),
// then the template's order.
export function sortTasks(tasks: PlanningTask[], roleOrder?: Map<string, number>): PlanningTask[] {
  const rank = (t: PlanningTask) => (t.role ? roleOrder?.get(t.role.id) ?? 500 : 1000);
  return [...tasks].sort(
    (a, b) =>
      a.month.localeCompare(b.month) ||
      rank(a) - rank(b) ||
      (a.role?.name ?? "").localeCompare(b.role?.name ?? "") ||
      a.sortOrder - b.sortOrder ||
      a.title.localeCompare(b.title),
  );
}

// Count of tasks waiting in Review, for the tab badge.
export async function countPendingPlanningTasks(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("planning_season", "is", null)
    .eq("review_status", "pending_review");
  return error ? 0 : count ?? 0;
}

// Which seasons have been sent to Review at all (any state).
export async function loadBuiltSeasons(supabase: SupabaseClient): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("planning_season")
    .is("deleted_at", null)
    .not("planning_season", "is", null);
  if (error) return new Set();
  return new Set(((data as { planning_season: number }[] | null) ?? []).map((r) => r.planning_season));
}

export async function loadPlanningRoles(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; roles: PlanningRole[] }> {
  const { data, error } = await supabase
    .from("planning_roles")
    .select("id, name, chip_class, member_id, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { ok: false, roles: [] };
  return { ok: true, roles: (data as PlanningRole[]) ?? [] };
}

export async function loadPlanningTemplates(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; templates: PlanningTemplate[] }> {
  const { data, error } = await supabase
    .from("planning_templates")
    .select("id, kind, title, notes, month, role_id, playbook_id, sort_order")
    .is("deleted_at", null);
  if (error) return { ok: false, templates: [] };
  return { ok: true, templates: (data as PlanningTemplate[]) ?? [] };
}

export async function loadPlaybookOptions(supabase: SupabaseClient): Promise<PlaybookLink[]> {
  const { data } = await supabase
    .from("playbooks")
    .select("id, title")
    .is("deleted_at", null)
    .order("title", { ascending: true });
  return (data as PlaybookLink[] | null) ?? [];
}

interface MeetingRow {
  id: string;
  month: string;
  meets_on: string | null;
  status: PlanningMeeting["status"];
  agenda_md: string;
  minutes_md: string;
}

// The board meetings from `from` through `to` (both months included), by month.
export async function loadMeetings(
  supabase: SupabaseClient,
  from: MonthKey,
  to: MonthKey,
): Promise<Map<MonthKey, PlanningMeeting>> {
  const { data, error } = await supabase
    .from("planning_meetings")
    .select("id, month, meets_on, status, agenda_md, minutes_md")
    .gte("month", firstDayOf(from))
    .lte("month", firstDayOf(to));
  const out = new Map<MonthKey, PlanningMeeting>();
  if (error) return out;
  for (const r of (data as MeetingRow[] | null) ?? []) {
    const month = monthKeyOf(r.month);
    out.set(month, { ...r, month });
  }
  return out;
}

// The earliest month anything in Planning happened, so Past and All know how
// far back to go. Null when there's nothing yet.
export async function earliestPlanningMonth(supabase: SupabaseClient): Promise<MonthKey | null> {
  const [{ data: m }, { data: t }] = await Promise.all([
    supabase.from("planning_meetings").select("month").order("month", { ascending: true }).limit(1),
    supabase
      .from("maintenance_requests")
      .select("due_on")
      .is("deleted_at", null)
      .not("planning_season", "is", null)
      .eq("review_status", "approved")
      .not("due_on", "is", null)
      .order("due_on", { ascending: true })
      .limit(1),
  ]);
  const months = [
    (m as { month: string }[] | null)?.[0]?.month,
    (t as { due_on: string }[] | null)?.[0]?.due_on,
  ]
    .filter((v): v is string => Boolean(v))
    .map(monthKeyOf)
    .sort();
  return months[0] ?? null;
}

export interface TaskPlanning {
  season: number;
  month: MonthKey;
  role: { id: string; name: string; chip_class: string } | null;
  playbook: { id: string; title: string; excerpt: string | null } | null;
  // What each board meeting said about this task, oldest first, and who
  // wrote it last.
  notes: { month: MonthKey; note_md: string; by: string | null; at: string }[];
}

// A task's place in Planning, for its task page: which season and month, its
// role and playbook, and the board meeting notes on it. Null for tasks that
// didn't come from the template (and for everything before migration 0104).
export async function loadTaskPlanning(supabase: SupabaseClient, taskId: string): Promise<TaskPlanning | null> {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select(
      `planning_season, due_on, start_on,
       template:planning_templates(month,
         role:planning_roles(id, name, chip_class, deleted_at),
         playbook:playbooks(id, title, excerpt, deleted_at))`,
    )
    .eq("id", taskId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    planning_season: number | null;
    due_on: string | null;
    start_on: string | null;
    template: {
      month: number | null;
      role: { id: string; name: string; chip_class: string; deleted_at: string | null } | null;
      playbook: { id: string; title: string; excerpt: string | null; deleted_at: string | null } | null;
    } | null;
  };
  if (row.planning_season == null) return null;
  const month = taskMonth({
    due_on: row.due_on,
    start_on: row.start_on,
    planning_season: row.planning_season,
    template_month: row.template?.month ?? null,
  });
  if (!month) return null;

  const { data: noteRows } = await supabase
    .from("planning_meeting_notes")
    .select("note_md, updated_by, updated_at, meeting:planning_meetings(month)")
    .eq("task_id", taskId);
  const rows = ((noteRows as unknown as {
    note_md: string;
    updated_by: string | null;
    updated_at: string;
    meeting: { month: string } | null;
  }[] | null) ?? []).filter((n) => n.meeting);
  const noteNames = await namesForUsers(supabase, rows.map((n) => n.updated_by));
  const notes = rows
    .map((n) => ({
      month: monthKeyOf(n.meeting!.month),
      note_md: n.note_md,
      by: n.updated_by ? noteNames.get(n.updated_by) ?? null : null,
      at: n.updated_at,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const role = row.template?.role && !row.template.role.deleted_at ? row.template.role : null;
  const playbook = row.template?.playbook && !row.template.playbook.deleted_at ? row.template.playbook : null;
  return {
    season: row.planning_season,
    month,
    role: role ? { id: role.id, name: role.name, chip_class: role.chip_class } : null,
    playbook: playbook ? { id: playbook.id, title: playbook.title, excerpt: playbook.excerpt } : null,
    notes,
  };
}

// ─── A meeting as it's saved now (for saving safely and for the page) ──────

export interface SavedBy {
  name: string | null;
  at: string;
}

export interface MeetingState {
  meetingId: string | null;
  revision: number;
  snapshot: MeetingSnapshot;
  // Revision of each task's note row, so a note is only changed from the
  // revision the save merged against.
  noteRevisions: Record<string, number>;
  savedBy: SavedBy | null;
  noteSavedBy: Record<string, SavedBy>;
}

// Member names for auth user ids (who saved what).
export async function namesForUsers(supabase: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await supabase.from("members").select("user_id, full_name, nickname, email").in("user_id", unique);
  for (const m of (data as { user_id: string; full_name: string | null; nickname: string | null; email: string }[] | null) ?? []) {
    out.set(m.user_id, memberDisplayName(m));
  }
  return out;
}

// `draftAgenda` fills the agenda of a meeting nobody has saved yet.
export async function loadMeetingState(
  supabase: SupabaseClient,
  month: MonthKey,
  draftAgenda = "",
): Promise<{ ok: boolean; state: MeetingState }> {
  const { data: m, error } = await supabase
    .from("planning_meetings")
    .select("id, meets_on, status, agenda_md, minutes_md, revision, updated_by, updated_at")
    .eq("month", firstDayOf(month))
    .maybeSingle();
  const empty: MeetingState = {
    meetingId: null,
    revision: 0,
    snapshot: { meetsOn: "", status: "planned", agendaMd: draftAgenda, minutesMd: "", notes: {} },
    noteRevisions: {},
    savedBy: null,
    noteSavedBy: {},
  };
  if (error) return { ok: false, state: empty };
  if (!m) return { ok: true, state: empty };
  const row = m as {
    id: string;
    meets_on: string | null;
    status: MeetingSnapshot["status"];
    agenda_md: string;
    minutes_md: string;
    revision: number;
    updated_by: string | null;
    updated_at: string;
  };
  const { data: n } = await supabase
    .from("planning_meeting_notes")
    .select("task_id, note_md, revision, updated_by, updated_at")
    .eq("meeting_id", row.id);
  const notes = (n as { task_id: string; note_md: string; revision: number; updated_by: string | null; updated_at: string }[] | null) ?? [];
  const names = await namesForUsers(supabase, [row.updated_by, ...notes.map((x) => x.updated_by)]);
  const state: MeetingState = {
    meetingId: row.id,
    revision: row.revision,
    snapshot: {
      meetsOn: row.meets_on ?? "",
      status: row.status,
      agendaMd: row.agenda_md,
      minutesMd: row.minutes_md,
      notes: Object.fromEntries(notes.map((x) => [x.task_id, x.note_md])),
    },
    noteRevisions: Object.fromEntries(notes.map((x) => [x.task_id, x.revision])),
    savedBy: { name: row.updated_by ? names.get(row.updated_by) ?? null : null, at: row.updated_at },
    noteSavedBy: Object.fromEntries(
      notes.map((x) => [x.task_id, { name: x.updated_by ? names.get(x.updated_by) ?? null : null, at: x.updated_at }]),
    ),
  };
  return { ok: true, state };
}
