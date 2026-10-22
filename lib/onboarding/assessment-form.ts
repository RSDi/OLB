// Assessment signup: the waitlist form, locked to one assessment's copy
// and age/grade rule. Submissions land on the same waitlist as /waitlist,
// tagged with the assessment and extra.assessment_id. Plain module, pure,
// safe for client and server.

import { DEFAULT_AGE_CAPS, DEFAULT_SEASON_ENDS_ON, lowestEligibleLevel } from "../teams/eligibility.ts";
import {
  ASSESSMENT_LEVEL,
  ASSESSMENT_PATH,
  ASSESSMENT_TAG,
  BUILTIN_14U,
  PROGRAMS_INFO_URL,
  assessmentTag,
  eligibilityProblem,
  parseGrade,
  playerFitsAssessment,
  type PublicAssessment,
} from "./assessments.ts";
import { previewWriteBlocked } from "./preview-only.ts";
import { intakeOf, waitlistProblem, type WaitlistInput } from "./waitlist-form.ts";

export {
  ASSESSMENT_COPY,
  ASSESSMENT_LEVEL,
  ASSESSMENT_PATH,
  ASSESSMENT_TAG,
  ASSESSMENTS_PATH,
  PROGRAMS_INFO_URL,
} from "./assessments.ts";

export function is14uEligible(dob: string): boolean {
  return lowestEligibleLevel(dob, DEFAULT_SEASON_ENDS_ON, DEFAULT_AGE_CAPS) === ASSESSMENT_LEVEL;
}

export function assessmentProblem(w: WaitlistInput, assessment: PublicAssessment = BUILTIN_14U): string | null {
  const base = waitlistProblem(w);
  if (base) return base;
  if (!playerFitsAssessment(assessment, w.athlete_dob, parseGrade(w.grade))) {
    return eligibilityProblem(assessment);
  }
  return null;
}

// Same extra shape as the waitlist form, plus the tag staff see on the card
// and assessment_id (uuid or builtin id). Offer-seed keeps reading
// extra.source = waitlist_form and extra.intake.
export function assessmentExtra(w: WaitlistInput, assessment: PublicAssessment = BUILTIN_14U) {
  const grade = (w.grade ?? "").trim();
  return {
    source: "waitlist_form" as const,
    tag: assessmentTag(assessment),
    assessment_id: assessment.id,
    assessment_slug: assessment.slug,
    first_season: true,
    intake: {
      ...intakeOf(w),
      level: assessment.level || ASSESSMENT_LEVEL,
      ...(grade ? { grade } : {}),
    },
  };
}

export function assessmentNotes(w: WaitlistInput, assessment: PublicAssessment = BUILTIN_14U): string | null {
  return w.homeschooled === false ? `Not homeschooled, from the ${assessment.name} form.` : null;
}

// Messages for a failed save. Keep these specific: the wizard used to swallow
// throws as "Something went wrong. Please try again."
export const ASSESSMENT_MISSING_DB =
  "This preview page can't save right now (database isn't configured). Email lightningbasketballomaha@gmail.com and we'll add you.";
export const ASSESSMENT_NOT_OPEN =
  "The assessment isn't open on this page right now. Email lightningbasketballomaha@gmail.com and we'll add you.";
export const ASSESSMENT_RATE_LIMITED = "We've had a few from this email already. Try again in an hour, or email us.";
export const ASSESSMENT_SAVE_FAILED = "Something went wrong saving that. Please try again.";
export const ASSESSMENT_SEND_FAILED = "Something went wrong sending that. Please reload the page and try again.";

export function friendlyAssessmentDbError(error: { code?: string; message?: string; details?: string } | null | undefined): string {
  const msg = `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (/permission denied|42501|pgrst301/.test(msg)) {
    return "This preview couldn't save (database permission). Email lightningbasketballomaha@gmail.com and we'll add you.";
  }
  if (/column|pgrst204|42703/.test(msg)) {
    return "This preview couldn't save (the form and the database don't match). Email lightningbasketballomaha@gmail.com and we'll add you.";
  }
  if (/foreign key|23503/.test(msg)) {
    return ASSESSMENT_NOT_OPEN;
  }
  return ASSESSMENT_SAVE_FAILED;
}

export type AssessmentSaveGate = {
  error?: string;
  id?: string;
  status: number;
};

// Shared checks for the page action and POST /api/assessments. Returns a
// result when the save must not write; null means continue to the database.
export function assessmentSaveGate(
  w: WaitlistInput,
  honeypot: string,
  env: Record<string, string | undefined> = process.env,
  assessment: PublicAssessment = BUILTIN_14U,
): AssessmentSaveGate | null {
  const blocked = previewWriteBlocked(env);
  if (blocked) return { error: blocked, status: 403 };
  if (honeypot && honeypot.trim()) return { status: 200 };
  if (!assessment.open) return { error: ASSESSMENT_NOT_OPEN, status: 404 };
  const problem = assessmentProblem(w, assessment);
  if (problem) return { error: problem, status: 400 };
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: ASSESSMENT_MISSING_DB, status: 503 };
  }
  return null;
}

export function friendlyAssessmentClientError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (/Invalid Server Actions request/i.test(raw)) {
    return "This preview page couldn't send the form (the request was blocked). Reload and try again.";
  }
  if (/Failed to find Server Action/i.test(raw)) {
    return "This page is out of date. Reload and try again.";
  }
  return ASSESSMENT_SEND_FAILED;
}
