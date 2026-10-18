// Vercel Cron: resume YouTube uploads for game film. Every minute. Auth is
// Bearer CRON_SECRET. maxDuration 300s; the worker stops around 240s so a
// 20 GB file continues on the next tick.
// After the upload tick, a light videos.list part=status pass copies each
// video's real privacy and processing onto the film row. Read-only.

import { NextResponse } from "next/server";
import { processYoutubeQueue, YOUTUBE_TICK_BUDGET_MS } from "../../../../lib/film/youtube";
import { syncYoutubeVideoStatus, YOUTUBE_STATUS_CRON_LIMIT } from "../../../../lib/film/youtube-status";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("film-youtube: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set; cron cannot push film to YouTube." },
      { status: 500 }
    );
  }

  try {
    const result = await processYoutubeQueue({ budgetMs: YOUTUBE_TICK_BUDGET_MS });
    let status;
    try {
      status = await syncYoutubeVideoStatus({ force: false, limit: YOUTUBE_STATUS_CRON_LIMIT });
    } catch (err) {
      status = {
        considered: 0,
        updated: 0,
        skipped: err instanceof Error ? err.message : "status sync failed",
      };
    }
    return NextResponse.json({ timestamp: new Date().toISOString(), ...result, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "youtube push failed" },
      { status: 500 }
    );
  }
}
