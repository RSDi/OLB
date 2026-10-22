// Step-by-step order for the assessment wizard. Same pattern as
// lib/teams/registration-steps.ts: a plain list so tests can check it.
// Optional steps (friends, heard, notes) still appear; the wizard lets
// families skip them. A grade step is inserted after birthday when the
// assessment has a grade rule.

import { looksLikeEmail } from "../teams/registration-form.ts";
import { BUILTIN_14U, GRADES, eligibilityProblem, hasGradeRule, parseGrade, playerFitsAssessment, type PublicAssessment } from "./assessments.ts";
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

export type AssessmentStep = (typeof ASSESSMENT_STEPS)[number] | "grade";

export function assessmentStepsFor(assessment: PublicAssessment = BUILTIN_14U): AssessmentStep[] {
  const steps: AssessmentStep[] = [...ASSESSMENT_STEPS];
  if (hasGradeRule(assessment)) {
    const i = steps.indexOf("dob");
    steps.splice(i + 1, 0, "grade");
  }
  return steps;
}

export function assessmentStepProblem(
  step: AssessmentStep,
  w: WaitlistInput,
  assessment: PublicAssessment = BUILTIN_14U,
): string | null {
  if (step === "name") {
    if (!w.athlete_first.trim() || !w.athlete_last.trim()) return "Please add your son's first and last name.";
    return null;
  }
  if (step === "dob") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.athlete_dob)) return "Please add his birthday.";
    if (!hasGradeRule(assessment) && !playerFitsAssessment(assessment, w.athlete_dob, parseGrade(w.grade))) {
      return eligibilityProblem(assessment, w.athlete_dob);
    }
    return null;
  }
  if (step === "grade") {
    if (parseGrade(w.grade) == null) return "Please add his grade.";
    if (!playerFitsAssessment(assessment, w.athlete_dob, parseGrade(w.grade))) {
      return eligibilityProblem(assessment, w.athlete_dob);
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

export { GRADES };
