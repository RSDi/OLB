// Server-only. Writes an assessment signup to the waitlist table.
// Assessments are on the production allowlist; other guarded writes stay
// blocked. extra.source stays waitlist_form so offer-seed and the Waitlist
// tab keep working; assessment_id and tag are additive.

import { createAdminClient } from "../supabase/admin";
import { sendPushToPermission } from "../notifications/push";
import {
  assessmentExtra,
  assessmentNotes,
  assessmentSaveGate,
  ASSESSMENT_MISSING_DB,
  ASSESSMENT_NOT_OPEN,
  ASSESSMENT_RATE_LIMITED,
  friendlyAssessmentDbError,
} from "./assessment-form";
import { loadAssessmentBySlug } from "./assessment-data";
import { BUILTIN_14U, type Assessment } from "./assessments";
import { previewWriteBlocked } from "./preview-only";
import { sendAssessmentEmails } from "../notifications/registration-receipt";
import { seasonBoardId } from "./server";
import { type WaitlistInput } from "./waitlist-form";

export type AssessmentSaveResult = {
  error?: string;
  id?: string;
  status: number;
};

function logSaveFailure(reason: string, extra?: Record<string, unknown>) {
  console.error("[assessment] save failed", {
    reason,
    vercelEnv: process.env.VERCEL_ENV ?? "(unset)",
    ...extra,
  });
}

export async function saveAssessment(
  input: WaitlistInput,
  honeypot: string,
  slug: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AssessmentSaveResult> {
  let assessment: Assessment | null = null;
  try {
    const blocked = previewWriteBlocked("assessments", env);
    if (blocked) {
      logSaveFailure("production_write_guard");
      return { error: blocked, status: 403 };
    }
    if (honeypot && honeypot.trim()) return { status: 200 };

    assessment = await loadAssessmentBySlug(slug);
    if (!assessment) {
      logSaveFailure("unknown_slug", { slug });
      return { error: ASSESSMENT_NOT_OPEN, status: 404 };
    }

    const gated = assessmentSaveGate(input, honeypot, env, assessment);
    if (gated) {
      if (gated.error) {
        logSaveFailure(
          gated.status === 403 ? "production_write_guard" : gated.status === 503 ? "missing_database_env" : "validation",
          gated.status === 503
            ? { hasUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL), hasServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY) }
            : undefined,
        );
      }
      return gated;
    }

    const db = createAdminClient();
    const boardId = await seasonBoardId(db);
    if (!boardId) {
      logSaveFailure("no_season_board");
      return { error: ASSESSMENT_NOT_OPEN, status: 503 };
    }

    const email = input.email.trim().toLowerCase();
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("olb_registrations").select("id", { count: "exact", head: true }).eq("parent_email", email).gte("created_at", hourAgo);
    if ((count ?? 0) >= 6) return { error: ASSESSMENT_RATE_LIMITED, status: 429 };

    const first = input.athlete_first.trim().slice(0, 60);
    const last = input.athlete_last.trim().slice(0, 60);
    const { data: dupes } = await db
      .from("olb_registrations")
      .select("id")
      .eq("board_id", boardId)
      .in("status", ["waitlisted", "pending"])
      .ilike("first_name", first.replace(/[%_\\]/g, (c) => `\\${c}`))
      .ilike("last_name", last.replace(/[%_\\]/g, (c) => `\\${c}`))
      .eq("dob", input.athlete_dob)
      .limit(1);
    if (dupes?.length) return { id: dupes[0].id as string, status: 200 };

    const parentName = `${input.parent_first.trim()} ${input.parent_last.trim()}`.trim().slice(0, 120);
    const { data: saved, error } = await db
      .from("olb_registrations")
      .insert({
        board_id: boardId,
        first_name: first,
        last_name: last,
        dob: input.athlete_dob,
        parent_name: parentName,
        parent_email: email,
        parent_phone: input.phone.trim().slice(0, 40) || null,
        status: "waitlisted",
        notes: assessmentNotes(input, assessment),
        extra: assessmentExtra(input, assessment),
      })
      .select("id")
      .single();
    if (error || !saved) {
      logSaveFailure("insert", {
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      });
      return { error: friendlyAssessmentDbError(error), status: 500 };
    }

    await sendPushToPermission("registrations", {
      title: `New ${assessment.name}: ${first} ${last}`,
      body: `From ${parentName}. Tap to see their answers.`,
      url: `/portal/directory/registrations?tab=waitlist&open=${saved.id}`,
      tag: `waitlist-${saved.id}`,
    });

    // Immediate confirmation + club notice, same Resend path as the
    // registration receipt. Not the workflow's Ask-me-first draft.
    const sent = await sendAssessmentEmails(input, assessment, saved.id as string).catch((e) => {
      console.error("[notify] assessment emails failed", e);
      return null;
    });
    if (sent) {
      const now = new Date().toISOString();
      const { error: logError } = await db.from("olb_registration_messages").insert({
        registration_id: saved.id,
        subject: sent.subject.slice(0, 200),
        body: sent.text.slice(0, 5000),
        sent_to: [sent.to],
        sent_by: null,
        sent_at: now,
      });
      if (logError) console.warn(`[assessment] keeping a copy of the confirmation failed: ${logError.message}`);
      // Claim the workflow dedupe key so Assessment thanks (Ask me first / On)
      // cannot send a second email for this sign-up.
      const { error: thanksError } = await db.from("olb_onboarding_emails").insert({
        board_id: boardId,
        kind: "assessment_thanks",
        dedupe_key: `assessment_thanks:${saved.id}`,
        to_emails: [sent.to],
        subject: sent.subject.slice(0, 300),
        body: sent.text.slice(0, 8000),
        registration_ids: [saved.id],
        status: "sent",
        sent_at: now,
      });
      if (thanksError && thanksError.code !== "23505") {
        console.warn(`[assessment] marking assessment_thanks sent failed: ${thanksError.message}`);
      }
    }
    return { id: saved.id as string, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const missingEnv = /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message);
    logSaveFailure(missingEnv ? "missing_database_env" : "exception", { message, slug });
    return { error: missingEnv ? ASSESSMENT_MISSING_DB : friendlyAssessmentDbError({ message }), status: missingEnv ? 503 : 500 };
  }
}

export async function save14uAssessment(
  input: WaitlistInput,
  honeypot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AssessmentSaveResult> {
  return saveAssessment(input, honeypot, BUILTIN_14U.slug, env);
}
