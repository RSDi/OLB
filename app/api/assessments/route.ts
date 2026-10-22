// PUBLIC — no auth. Assessment signup. Assessments is on the production
// allowlist; the save path inserts into olb_registrations. Same destination
// as the waitlist form, tagged with the assessment.

import { NextResponse } from "next/server";
import { asWaitlistInput } from "../../../lib/onboarding/assessment-input";
import { saveAssessment } from "../../../lib/onboarding/assessment-save";
import { previewRouteOpen } from "../../../lib/onboarding/preview-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { input?: unknown; honeypot?: unknown; slug?: unknown } = {};
  try {
    body = (await request.json()) as { input?: unknown; honeypot?: unknown; slug?: unknown };
  } catch {
    return NextResponse.json({ error: "Please send the form again." }, { status: 400 });
  }
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!slug.trim()) return NextResponse.json({ error: "Please pick an assessment." }, { status: 400 });
  const result = await saveAssessment(asWaitlistInput(body.input), honeypot, slug);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ id: result.id ?? null }, { status: 200 });
}

export async function GET() {
  if (!previewRouteOpen("assessments")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
