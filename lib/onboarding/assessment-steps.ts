// Step-by-step order for the 14U assessment wizard. Same pattern as
// lib/teams/registration-steps.ts: a plain list so tests can check it.
// Optional steps (friends, heard, notes) still appear; the wizard lets
// families skip them.

import { is14uEligible } from "./assessment-form.ts";
import { looksLikeEmail } from "../teams/registration-form.ts";
import type { WaitlistInput } from "./waitlist-form.ts";

export const ASSESSMENT_STEPS = [
  "intro",
  "name",
  "dob",
  "homeschooled",
  "experience",
  "friends",
  "heard",
  "you",
  "contact",
  "notes",
  "summary",
] as const;

export type AssessmentStep = (typeof ASSESSMENT_STEPS)[number];

export function assessmentStepProblem(step: AssessmentStep, w: WaitlistInput): string | null {
  if (step === "name") {
    if (!w.athlete_first.trim() || !w.athlete_last.trim()) return "Please add your son's first and last name.";
    return null;
  }
  if (step === "dob") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.athlete_dob)) return "Please add his birthday.";
    if (!is14uEligible(w.athlete_dob)) {
      return "This assessment is for 14U players only. Please check his birthday, or email lightningbasketballomaha@gmail.com.";
    }
    return null;
  }
  if (step === "homeschooled") {
    if (w.homeschooled === null) return "Please tell us whether he's homeschooled.";
    return null;
  }
  if (step === "experience") {
    if (!w.experience) return "Please tell us whether he's played before.";
    return null;
  }
  if (step === "you") {
    if (!w.parent_first.trim() || !w.parent_last.trim()) return "Please add your name.";
    return null;
  }
  if (step === "contact") {
    if (!looksLikeEmail(w.email)) return "Please add an email we can reach you at.";
    return null;
  }
  return null;
}
