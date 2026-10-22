// Turn a JSON body into WaitlistInput. Shared by POST /api/assessments
// and POST /api/14u-assessment.

import { emptyWaitlist, type WaitlistInput } from "./waitlist-form.ts";

export function asWaitlistInput(raw: unknown): WaitlistInput {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blank = emptyWaitlist();
  const text = (key: Exclude<keyof WaitlistInput, "homeschooled">) =>
    typeof src[key] === "string" ? (src[key] as string) : ((blank[key] as string | undefined) ?? "");
  const homeschooled = src.homeschooled === true ? true : src.homeschooled === false ? false : null;
  return {
    parent_first: text("parent_first"),
    parent_last: text("parent_last"),
    email: text("email"),
    phone: text("phone"),
    athlete_first: text("athlete_first"),
    athlete_last: text("athlete_last"),
    athlete_dob: text("athlete_dob"),
    homeschooled,
    experience: text("experience"),
    friends: text("friends"),
    heard_from: text("heard_from"),
    notes: text("notes"),
    grade: text("grade"),
  };
}
