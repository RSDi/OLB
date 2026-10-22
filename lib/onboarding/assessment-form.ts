// The 14U assessment form: the waitlist form, locked to 14U, with Rachel's
// copy. Submissions land on the same waitlist as /waitlist, tagged
// "14U assessment". Plain module, pure, safe for client and server.

import { DEFAULT_AGE_CAPS, DEFAULT_SEASON_ENDS_ON, lowestEligibleLevel } from "../teams/eligibility.ts";
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
