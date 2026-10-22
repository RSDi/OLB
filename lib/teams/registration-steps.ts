// The registration wizard's step list. Plain module, pure, so tests can
// check the order (including the commitments steps after homeschool).

import { isHighSchoolTier, type RegistrationState } from "./registration-form.ts"; // explicit extension so node --test can load this file
import { needsSizesStep, type FormExtras } from "../onboarding/form-extras.ts";
import { commitmentsSteps } from "./registration-commitments.ts";

export type RegistrationMode = "returning" | "new";

export type RegistrationStepOpts = {
  // Offer-link family: skip steps whose answers are already filled. Those
  // fields stay on the summary (and the full form) so they can still change
  // them. The second parent is optional — they add them from review if needed.
  offerSeeded?: boolean;
};

export function buildRegistrationSteps(
  mode: RegistrationMode,
  st: RegistrationState,
  fromFile: Set<string>,
  config: FormExtras | null,
  opts: RegistrationStepOpts = {}
): string[] {
  const offer = opts.offerSeeded === true;
  const out: string[] = [];
  const kidSteps = (k: RegistrationState["kids"][number]) => {
    const steps: string[] = [];
    if (!(offer && k.athlete_first.trim() && k.athlete_last.trim())) steps.push(`name:${k.key}`);
    if (!(offer && k.athlete_dob)) steps.push(`dob:${k.key}`);
    if (!(offer && k.first_season !== null)) steps.push(`first:${k.key}`);
    return steps;
  };
  if (mode === "new") {
    for (const k of st.kids) out.push(...kidSteps(k));
    if (!offer) out.push("more");
    out.push("home", "contact", "you");
    if (!offer) out.push("you-details", "other-parent");
  } else {
    if (st.kids.some((k) => fromFile.has(k.key))) out.push("review-kids");
    for (const k of st.kids) if (!fromFile.has(k.key)) out.push(...kidSteps(k));
    out.push("review-home", "review-parents");
  }
  if (!(offer && st.kids.every((k) => !!k.fee_tier))) out.push("fees");
  out.push("uniform");
  if (st.kids.some((k) => isHighSchoolTier(k.fee_tier))) out.push("grays");
  if (config && needsSizesStep(st.kids, config.items)) out.push("sizes");
  out.push("homeschool");
  out.push(...commitmentsSteps(st.family.commitments_has));
  if (st.family.father_first.trim()) out.push("help-father");
  if (st.family.mother_first.trim()) out.push("help-mother");
  out.push("directory", "waiver");
  if (config?.handbookUrl) out.push("handbook");
  out.push("donation", "payment", "summary");
  return out;
}
