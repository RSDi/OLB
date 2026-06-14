// Vercel Cron endpoint — daily shutdown-task generation (Phase 2c).
//
// Expands recurring, shutdown-linked events into upcoming occurrence dates and
// creates one dated, unassigned shutdown task per occurrence (idempotent).
// Staff then assign each to a Building Shutdown team member.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the schedule is configured in vercel.json. Manual curl invocations need the
// same header. Mirrors /api/cron/pm-generate.

import { NextResponse } from "next/server";
import { generateUpcomingShutdownTasks } from "../../../../lib/shutdown/generate";

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret —
  // a different status would tell probers the deployment is misconfigured.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("shutdown-generate: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY not set; cron cannot insert shutdown tasks (RLS blocks unauthenticated writes).",
      },
      { status: 500 }
    );
  }

  const summary = await generateUpcomingShutdownTasks();
  return NextResponse.json(summary);
}
