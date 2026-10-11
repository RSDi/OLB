// Vercel Cron endpoint: the registration workflow's daily run (0130). Offer
// check-ins and close-outs, the clinic invite, weekly open items, the
// practice countdown, the Slack check and the Registrations reminders. Does
// nothing for a season whose workflow is off.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the schedule is configured in vercel.json. Mirrors /api/cron/shutdown-generate.

import { NextResponse } from "next/server";
import { runDaily } from "../../../../lib/onboarding/cron";

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("onboarding: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set; the onboarding run needs it." }, { status: 500 });
  }
  const summary = await runDaily();
  return NextResponse.json(summary);
}
