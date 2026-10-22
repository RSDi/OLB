// PUBLIC — no auth. Preview-only 14U assessment signup. Production
// (VERCEL_ENV=production) refuses the write. Same destination as the
// waitlist form: olb_registrations, tagged "14U assessment".

import { NextResponse } from "next/server";
import { save14uAssessment } from "../../../lib/onboarding/assessment-save";
import { emptyWaitlist, type WaitlistInput } from "../../../lib/onboarding/waitlist-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asInput(raw: unknown): WaitlistInput {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blank = emptyWaitlist();
  const text = (key: Exclude<keyof WaitlistInput, "homeschooled">) =>
    typeof src[key] === "string" ? (src[key] as string) : (blank[key] as string);
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
  };
}

export async function POST(request: Request) {
  let body: { input?: unknown; honeypot?: unknown } = {};
  try {
    body = (await request.json()) as { input?: unknown; honeypot?: unknown };
  } catch {
    return NextResponse.json({ error: "Please send the form again." }, { status: 400 });
  }
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  const result = await save14uAssessment(asInput(body.input), honeypot);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id ?? null }, { status: 200 });
}
