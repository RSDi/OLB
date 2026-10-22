"use server";

// Settings → Assessments. Registrations permission only. Writes with the
// service role so a missing RLS policy can't block a preview test; the
// permission check still runs first. Public assessment signups are on the
// production allowlist; this admin tab stays preview-gated in Settings.

import { revalidatePath } from "next/cache";
import { requireRegistrations } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { loadAssessments } from "./assessment-data";
import { cleanAssessmentInput, tableMissing, type Assessment, type AssessmentInput } from "./assessments";
import { seasonBoardId } from "./server";

type ListResult = { assessments: Assessment[]; fromTable: boolean; error?: string };
type SaveResult = { error?: string; id?: string };

function refresh() {
  revalidatePath("/portal/settings");
  revalidatePath("/assessments");
}

export async function listAssessments(): Promise<ListResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { assessments: [], fromTable: false, error: gate.error };
  try {
    return await loadAssessments();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load assessments.";
    return { assessments: [], fromTable: false, error: message };
  }
}

export async function saveAssessmentRow(input: AssessmentInput): Promise<SaveResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const cleaned = cleanAssessmentInput(input);
  if ("error" in cleaned) return { error: cleaned.error };
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };

  const row = {
    board_id: boardId,
    slug: cleaned.slug,
    name: cleaned.name,
    level: cleaned.level,
    dob_from: cleaned.dob_from,
    dob_to: cleaned.dob_to,
    grade_from: cleaned.grade_from,
    grade_to: cleaned.grade_to,
    starts_at: cleaned.starts_at,
    place: cleaned.place,
    details: cleaned.details,
    open: cleaned.open,
    thanks_subject: cleaned.thanks_subject,
    thanks_body: cleaned.thanks_body,
    reminder_subject: cleaned.reminder_subject,
    reminder_body: cleaned.reminder_body,
    updated_by: gate.userId,
    updated_at: new Date().toISOString(),
  };

  const query = cleaned.id
    ? db.from("olb_assessments").update(row).eq("id", cleaned.id).eq("board_id", boardId).select("id").single()
    : db.from("olb_assessments").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) {
    if (tableMissing(error)) {
      return { error: "Assessments aren't in this database yet. Paste the SQL from the pull request, then try again." };
    }
    if (error.code === "23505") return { error: "That address is already used. Pick another slug." };
    return { error: error.message };
  }
  refresh();
  return { id: (data as { id: string } | null)?.id };
}

export async function setAssessmentOpen(id: string, open: boolean): Promise<SaveResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  if (!id || id.startsWith("builtin-")) {
    return { error: "Assessments aren't in this database yet. Paste the SQL from the pull request, then try again." };
  }
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  const { error } = await db
    .from("olb_assessments")
    .update({ open, updated_by: gate.userId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("board_id", boardId);
  if (error) {
    if (tableMissing(error)) {
      return { error: "Assessments aren't in this database yet. Paste the SQL from the pull request, then try again." };
    }
    return { error: error.message };
  }
  refresh();
  return {};
}
