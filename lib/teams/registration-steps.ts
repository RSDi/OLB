// The registration wizard's step list. Plain module, pure, so tests can
// check the order (including the commitments steps after homeschool).

import { isHighSchoolTier, type RegistrationState } from "./registration-form.ts"; // explicit extension so node --test can load this file
import { needsSizesStep, type FormExtras } from "../onboarding/form-extras.ts";
import { commitmentsSteps } from "./registration-commitments.ts";

export type RegistrationMode = "returning" | "new";

export function buildRegistrationSteps(
  mode: RegistrationMode,
  st: RegistrationState,
  fromFile: Set<string>,
  config: FormExtras | null
): string[] {
  const out: string[] = [];
  const kidSteps = (k: RegistrationState["kids"][number]) => [`name:${k.key}`, `dob:${k.key}`, `first:${k.key}`];
  if (mode === "new") {
    for (const k of st.kids) out.push(...kidSteps(k));
    out.push("more", "home", "contact", "you", "you-details", "other-parent");
  } else {
    if (st.kids.some((k) => fromFile.has(k.key))) out.push("review-kids");
    for (const k of st.kids) if (!fromFile.has(k.key)) out.push(...kidSteps(k));
    out.push("review-home", "review-parents");
  }
  out.push("fees", "uniform");
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
