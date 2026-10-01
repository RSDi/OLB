// Vercel Cron endpoint: nightly catch-up for the Search page's
// search-by-meaning index. Works through search_index_queue (every record
// changed since it was last indexed) for up to 50 seconds; whatever's left
// waits for the next search (app/api/portal-search) or the next night. A big
// backlog, like the first build after migration 0113, is quicker with
// `npm run search-index`. Same auth gate as /api/cron/slack-archive-sync.

import { NextResponse } from "next/server";
import { processIndexQueue } from "../../../../lib/portal-search/indexer";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("search-index: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set; the index can't be written." }, { status: 500 });
  }
  const run = await processIndexQueue({ deadlineMs: 50_000 });
  return NextResponse.json(run, { status: run.errors.length ? 500 : 200 });
}
