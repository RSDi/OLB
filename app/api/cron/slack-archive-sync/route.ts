// Vercel Cron endpoint — nightly Slack channel archive sync.
//
// Loops every active row in slack_archive_channels, pulling anything new
// since each channel's stored high-water mark. Mirrors
// /api/cron/shutdown-generate's thin shape: auth-gate, then delegate
// everything to lib/slack-archive/sync.ts.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the schedule is configured in vercel.json. Manual curl invocations need
// the same header.

import { NextResponse } from "next/server";
import { syncAllActiveChannels } from "../../../../lib/slack-archive/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Leave headroom under maxDuration so a mid-walk stop (see sync.ts) has time
// to return cleanly instead of being hard-killed by the platform.
const SYNC_DEADLINE_MS = 50_000;

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret —
  // a different status would tell probers the deployment is misconfigured.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("slack-archive-sync: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY not set; cron cannot sync the Slack archive (RLS blocks unauthenticated writes).",
      },
      { status: 500 },
    );
  }

  const summary = await syncAllActiveChannels({ deadlineMs: SYNC_DEADLINE_MS });
  return NextResponse.json(summary);
}
