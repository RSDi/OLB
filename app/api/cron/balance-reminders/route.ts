// Vercel Cron endpoint: the weekly balance reminder (0133). Runs daily; each
// season's reminder goes on the weekday Settings → Fees picks, to families
// that owe, until they've paid. Does nothing while the reminder is off.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the schedule is configured in vercel.json. Mirrors /api/cron/onboarding.

import { NextResponse } from "next/server";
import { runBalanceReminders } from "../../../../lib/finances/reminder-cron";

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("balance-reminders: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set; the reminder run needs it." }, { status: 500 });
  }
  return NextResponse.json(await runBalanceReminders());
}
