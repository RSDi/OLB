// GET /watch/<team>/play?v=<upload id> — the team film page plays a game
// that isn't on YouTube yet from the original file. Redirects to a short-
// lived signed Storage URL; the page's <video> tag follows it.

import { NextResponse } from "next/server";
import { filmStorage } from "../../../../lib/film/storage";
import { clientIp, rateLimitTake } from "../../../../lib/film/rate-limit";
import { getWatchFileUpload } from "../../../../lib/film/watch-data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAY_LIMIT = { max: 120, windowMs: 60 * 60 * 1000 };
const PLAY_TTL_S = 3 * 60 * 60;

export async function GET(request: Request, { params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  const id = new URL(request.url).searchParams.get("v") ?? "";
  if (!UUID_RE.test(id)) return new NextResponse("Not found", { status: 404 });

  const limited = rateLimitTake(`film-watch:${clientIp(request.headers)}`, PLAY_LIMIT);
  if (!limited.ok) {
    return new NextResponse("Too many requests. Try again in a few minutes.", {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfterSec) },
    });
  }

  let row;
  try {
    row = await getWatchFileUpload(team, id);
  } catch {
    return new NextResponse("Couldn't load that game.", { status: 500 });
  }
  if (!row) return new NextResponse("Not found", { status: 404 });

  try {
    const url = await filmStorage().signedDownloadUrl(row.storage_path, PLAY_TTL_S);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Couldn't load that game.", { status: 502 });
  }
}
