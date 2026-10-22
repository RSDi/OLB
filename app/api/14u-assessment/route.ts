// PUBLIC — no auth. 14U assessment signup. Assessments is on the
// production allowlist; the save path inserts into olb_registrations.
// Same destination as the waitlist form, tagged "14U assessment".

import { NextResponse } from "next/server";
import { asWaitlistInput } from "../../../lib/onboarding/assessment-input";
import { save14uAssessment } from "../../../lib/onboarding/assessment-save";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { input?: unknown; honeypot?: unknown } = {};
  try {
    body = (await request.json()) as { input?: unknown; honeypot?: unknown };
  } catch {
    return NextResponse.json({ error: "Please send the form again." }, { status: 400 });
  }
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  const result = await save14uAssessment(asWaitlistInput(body.input), honeypot);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id ?? null }, { status: 200 });
}
