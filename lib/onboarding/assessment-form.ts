// The 14U assessment form: the waitlist form, locked to 14U, with Rachel's
// copy. Submissions land on the same waitlist as /waitlist, tagged
// "14U assessment". Plain module, pure, safe for client and server.

import { DEFAULT_AGE_CAPS, DEFAULT_SEASON_ENDS_ON, lowestEligibleLevel } from "../teams/eligibility.ts";
import { previewWriteBlocked } from "./preview-only.ts";
import { intakeOf, waitlistProblem, type WaitlistInput } from "./waitlist-form.ts";

export const ASSESSMENT_TAG = "14U assessment";
export const ASSESSMENT_LEVEL = "14U";
export const ASSESSMENT_PATH = "/14u-assessment";
export const PROGRAMS_INFO_URL = "https://omahalightningbasketball.com/programs";

// Exact words Rachel asked for (Jeff Malone via Jefe, 2026-10-22).
export const ASSESSMENT_COPY =
  "We are accepting two more players at the 14U level. Please sign up for an assessment if you are interested in being considered. Playing for Omaha Lightning is a commitment to a competitive team, October through February. Practices have already begun, so assessments will be immediate.";

export function is14uEligible(dob: string): boolean {
  return lowestEligibleLevel(dob, DEFAULT_SEASON_ENDS_ON, DEFAULT_AGE_CAPS) === ASSESSMENT_LEVEL;
}

export function assessmentProblem(w: WaitlistInput): string | null {
  const base = waitlistProblem(w);
  if (base) return base;
  if (!is14uEligible(w.athlete_dob)) {
    return "This assessment is for 14U players only. Please check his birthday, or email lightningbasketballomaha@gmail.com.";
  }
  return null;
}

// Same extra shape as the waitlist form, plus the tag staff see on the card.
export function assessmentExtra(w: WaitlistInput) {
  return {
    source: "waitlist_form" as const,
    tag: ASSESSMENT_TAG,
    first_season: true,
    intake: { ...intakeOf(w), level: ASSESSMENT_LEVEL },
  };
}

export function assessmentNotes(w: WaitlistInput): string | null {
  return w.homeschooled === false ? "Not homeschooled, from the 14U assessment form." : null;
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

// Shared checks for the page action and POST /api/14u-assessment. Returns a
// result when the save must not write; null means continue to the database.
export function assessmentSaveGate(
  w: WaitlistInput,
  honeypot: string,
  env: Record<string, string | undefined> = process.env,
): AssessmentSaveGate | null {
  const blocked = previewWriteBlocked(env);
  if (blocked) return { error: blocked, status: 403 };
  if (honeypot && honeypot.trim()) return { status: 200 };
  const problem = assessmentProblem(w);
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
