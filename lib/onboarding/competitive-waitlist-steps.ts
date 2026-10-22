// Step-by-step order for the 10U–14U competitive waitlist wizard. Same
// pattern as lib/teams/registration-steps.ts and the 14U assessment: a
// plain list so tests can check it. One Cognito question group per step.

import { looksLikeEmail } from "../teams/registration-form.ts";
import {
  competitiveWaitlistProblem,
  looksLikeUsPhone,
  parentContactProblem,
  parentNameProblem,
  type CompetitiveWaitlistInput,
} from "./competitive-waitlist-form.ts";

export const COMPETITIVE_WAITLIST_STEPS = [
  "intro",
  "name",
  "birthdate",
  "first-experience",
  "athlete-contact",
  "homeschooled",
  "father",
  "mother",
  "summary",
] as const;

export type CompetitiveWaitlistStep = (typeof COMPETITIVE_WAITLIST_STEPS)[number];

export function competitiveStepProblem(step: CompetitiveWaitlistStep, w: CompetitiveWaitlistInput): string | null {
  if (step === "name") {
    if (!w.athlete_first.trim() || !w.athlete_last.trim()) return "Please add the athlete's first and last name.";
    return null;
  }
  if (step === "birthdate") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.athlete_dob)) return "Please add the athlete's birthdate.";
    return null;
  }
  if (step === "athlete-contact") {
    if (w.athlete_email.trim() && !looksLikeEmail(w.athlete_email)) return "Please add an athlete email we can use, or leave it blank.";
    if (w.athlete_phone.trim() && !looksLikeUsPhone(w.athlete_phone)) return "Please add an athlete phone we can use, or leave it blank.";
    return null;
  }
  if (step === "homeschooled") {
    if (w.homeschooled === null) return "Please tell us whether he's homeschooled.";
    if (w.homeschooled !== true) {
      return "This waitlist is for homeschooled athletes (answer Yes). If your son is in a co-op three or more days a week, email LightningBasketballOmaha@gmail.com to discuss eligibility.";
    }
    return null;
  }
  if (step === "father") return parentNameProblem(w.father, "father") ?? parentContactProblem(w.father, "father");
  if (step === "mother") return parentNameProblem(w.mother, "mother") ?? parentContactProblem(w.mother, "mother");
  if (step === "summary") return competitiveWaitlistProblem(w);
  return null;
}
