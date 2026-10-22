// Server-only. Loads assessments for the public form and Settings.
// When olb_assessments isn't applied yet, the preview uses the two builtin
// samples so /assessments still works.

import { createAdminClient } from "../supabase/admin";
import {
  BUILTIN_14U,
  BUILTIN_ASSESSMENTS,
  tableMissing,
  type Assessment,
} from "./assessments";
import { seasonBoardId } from "./server";

type Row = {
  id: string;
  slug: string;
  name: string;
  level: string | null;
  dob_from: string | null;
  dob_to: string | null;
  grade_from: number | null;
  grade_to: number | null;
  starts_at: string | null;
  place: string | null;
  details: string;
  open: boolean;
  thanks_subject: string | null;
  thanks_body: string | null;
  reminder_subject: string | null;
  reminder_body: string | null;
};

function asAssessment(row: Row): Assessment {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    level: row.level,
    dob_from: row.dob_from,
    dob_to: row.dob_to,
    grade_from: row.grade_from,
    grade_to: row.grade_to,
    starts_at: row.starts_at,
    place: row.place,
    details: row.details ?? "",
    open: row.open,
    thanks_subject: row.thanks_subject,
    thanks_body: row.thanks_body,
    reminder_subject: row.reminder_subject,
    reminder_body: row.reminder_body,
  };
}

export type AssessmentLoad = {
  assessments: Assessment[];
  fromTable: boolean;
};

export async function loadAssessments(): Promise<AssessmentLoad> {
  try {
    const db = createAdminClient();
    const boardId = await seasonBoardId(db);
    if (!boardId) return { assessments: BUILTIN_ASSESSMENTS, fromTable: false };
    const { data, error } = await db
      .from("olb_assessments")
      .select(
        "id, slug, name, level, dob_from, dob_to, grade_from, grade_to, starts_at, place, details, open, thanks_subject, thanks_body, reminder_subject, reminder_body",
      )
      .eq("board_id", boardId)
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("name");
    if (error) {
      if (tableMissing(error)) return { assessments: BUILTIN_ASSESSMENTS, fromTable: false };
      console.error("[assessments] load failed", error.message);
      return { assessments: BUILTIN_ASSESSMENTS, fromTable: false };
    }
    const rows = ((data as Row[] | null) ?? []).map(asAssessment);
    if (!rows.length) return { assessments: BUILTIN_ASSESSMENTS, fromTable: true };
    return { assessments: rows, fromTable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (tableMissing({ message }) || /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message)) {
      return { assessments: BUILTIN_ASSESSMENTS, fromTable: false };
    }
    throw err;
  }
}

export async function loadOpenAssessments(): Promise<Assessment[]> {
  return (await loadAssessments()).assessments.filter((a) => a.open);
}

export async function loadAssessmentBySlug(slug: string): Promise<Assessment | null> {
  const key = slug.trim().toLowerCase();
  if (!key) return null;
  const { assessments } = await loadAssessments();
  return assessments.find((a) => a.slug === key) ?? (key === BUILTIN_14U.slug ? BUILTIN_14U : null);
}
