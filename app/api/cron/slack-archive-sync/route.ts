// Vercel Cron endpoint — nightly Slack channel archive sync.
//
// Loops every active row in slack_archive_channels, re-pulling and
// overwriting the last 24 hours of each channel's history — a fixed rolling
// window, NOT each channel's stored high-water mark. Deliberately not
// incremental-from-watermark: a channel whose watermark gets stuck (a bad
// sync_state row, a manual reset gone wrong, anything) would otherwise sit
// silently frozen forever, since nothing else ever re-checks it. A rolling
// 24h re-fetch is self-healing every night regardless of watermark state, at
// the cost of never catching edits/reactions on messages older than 24h.
// Runs as two passes over the channels — every channel's new messages
// first, then thread-reply refresh with whatever budget is left — so one
// channel with a lot of threads can't starve the others (see
// syncAllActiveChannels in sync.ts for the history). Mirrors
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
const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  const summary = await syncAllActiveChannels({ deadlineMs: SYNC_DEADLINE_MS, windowMs: SYNC_WINDOW_MS });
  return NextResponse.json(summary);
}
