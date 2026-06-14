// Loaders + shared types for playbook procedures (0066). A playbook owns many
// procedures (ordered checklists), each with its own notify config and a run
// history. Read via the cookie client (RLS: all-staff read live rows; run
// history is staff-only).

import { createClient } from "../supabase/server";

export interface ProcedureStep {
  label: string;
}

export interface PlaybookProcedure {
  id: string;
  playbook_id: string;
  title: string;
  steps: ProcedureStep[];
  notify: boolean;
  slack_channel: string | null;
  completion_message: string | null;
  sort_order: number;
}

export interface ProcedureRun {
  id: string;
  procedure_id: string;
  ran_by_name: string | null;
  ran_at: string;
  notified: boolean;
  source: string | null;
}

// All procedures of a playbook, ordered. Tolerant of a pre-0066 schema
// (missing table → empty list) so the playbook page never hard-fails.
export async function loadProcedures(playbookId: string): Promise<PlaybookProcedure[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbook_procedures")
    .select("id, playbook_id, title, steps, notify, slack_channel, completion_message, sort_order")
    .eq("playbook_id", playbookId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("loadProcedures failed", error);
    return [];
  }
  return ((data ?? []) as unknown as PlaybookProcedure[]).map(p => ({
    ...p,
    steps: Array.isArray(p.steps) ? p.steps : [],
  }));
}

// Run history for a set of procedures, newest-first, capped per procedure.
// Staff-read RLS; callers gate to staff. Returns a map procedure_id → runs.
export async function loadProcedureRuns(
  procedureIds: string[],
  limitPerProcedure = 50,
): Promise<Map<string, ProcedureRun[]>> {
  const ids = Array.from(new Set(procedureIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedure_runs")
    .select("id, procedure_id, ran_by_name, ran_at, notified, source")
    .in("procedure_id", ids)
    .order("ran_at", { ascending: false });
  if (error) {
    console.error("loadProcedureRuns failed", error);
    return new Map();
  }
  const map = new Map<string, ProcedureRun[]>();
  for (const run of (data ?? []) as unknown as ProcedureRun[]) {
    const list = map.get(run.procedure_id) ?? [];
    if (list.length < limitPerProcedure) list.push(run);
    map.set(run.procedure_id, list);
  }
  return map;
}

// Procedures selectable as an event's building-shutdown, labeled
// "Playbook — Procedure". Ordered by playbook then procedure order.
export interface RunnableProcedureOption {
  id: string;
  label: string;
}

export async function loadRunnableProcedures(): Promise<RunnableProcedureOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("playbook_procedures")
    .select("id, title, sort_order, playbook:playbooks!playbook_id(title, deleted_at)")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("loadRunnableProcedures failed", error);
    return [];
  }
  type Row = { id: string; title: string; sort_order: number; playbook: { title: string; deleted_at: string | null } | null };
  return ((data ?? []) as unknown as Row[])
    .filter(r => r.playbook && !r.playbook.deleted_at)
    .map(r => ({ id: r.id, label: `${r.playbook!.title} — ${r.title}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
