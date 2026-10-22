// PUBLIC — no auth. Preview-only 10U–14U competitive waitlist. Production
// (VERCEL_ENV=production) refuses the write. Same destination as the
// waitlist form: olb_registrations, tagged "10U-14U competitive waitlist".

import { NextResponse } from "next/server";
import { saveCompetitiveWaitlist } from "../../../lib/onboarding/competitive-waitlist-save";
import { emptyCompetitiveWaitlist, emptyParent, type CompetitiveParent, type CompetitiveWaitlistInput } from "../../../lib/onboarding/competitive-waitlist-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asParent(raw: unknown): CompetitiveParent {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blank = emptyParent();
  const text = (key: keyof CompetitiveParent) => (typeof src[key] === "string" ? (src[key] as string) : blank[key]);
  return { first: text("first"), last: text("last"), email: text("email"), phone: text("phone") };
}

function asInput(raw: unknown): CompetitiveWaitlistInput {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const blank = emptyCompetitiveWaitlist();
  const text = (key: "athlete_first" | "athlete_last" | "athlete_dob" | "athlete_phone" | "athlete_email") =>
    typeof src[key] === "string" ? (src[key] as string) : blank[key];
  const homeschooled = src.homeschooled === true ? true : src.homeschooled === false ? false : null;
  const first_experience = src.first_experience === true ? true : src.first_experience === false ? false : null;
  return {
    athlete_first: text("athlete_first"),
    athlete_last: text("athlete_last"),
    athlete_dob: text("athlete_dob"),
    first_experience,
    athlete_phone: text("athlete_phone"),
    athlete_email: text("athlete_email"),
    homeschooled,
    father: asParent(src.father),
    mother: asParent(src.mother),
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
  const result = await saveCompetitiveWaitlist(asInput(body.input), honeypot);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id ?? null }, { status: 200 });
}
