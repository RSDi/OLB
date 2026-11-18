// POST /film/upload-token/resume — the phone lost its place (the page was
// closed, the screen locked, or the signed token ran out) on an upload it
// already started. Re-sign a token for the same storage path so the phone
// can ask Storage how far it got and send only the rest. Same team-code
// session and rate limit as /film/upload-token; never sees file bytes.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FILM_COOKIE, parseFilmSession, sessionMatchesTeam } from "../../../../lib/film/session";
import { getFilmTeamBySlug } from "../../../../lib/film/teams";
import { TOKEN_LIMIT, clientIp, rateLimitTake } from "../../../../lib/film/rate-limit";
import { filmStorage } from "../../../../lib/film/storage";
import { getFilmUpload } from "../../../../lib/film/uploads";
import { formatFilmGameLine } from "../../../../lib/film/game-meta";
import { resumeRefusal } from "../../../../lib/film/resume";

export async function POST(request: Request) {
  const store = await cookies();
  const session = parseFilmSession(store.get(FILM_COOKIE)?.value);
  const team = session ? await getFilmTeamBySlug(session.slug).catch(() => null) : null;
  if (!session || !sessionMatchesTeam(session, team) || !team) {
    return NextResponse.json({ error: "Unlock this team with the shared code first." }, { status: 401 });
  }

  const ip = clientIp(request.headers);
  const limited = rateLimitTake(`film-resume:${ip}`, TOKEN_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: { uploadId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  }
  const id = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!id) return NextResponse.json({ error: "Send the upload id." }, { status: 400 });

  const row = await getFilmUpload(id).catch(() => null);
  const refusal = resumeRefusal(row, team.slug);
  if (refusal || !row) {
    return NextResponse.json({ error: refusal ?? "That upload can't be picked back up." }, { status: 409 });
  }

  let signed;
  try {
    signed = await filmStorage().resignUpload(row.storage_path);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't pick the upload back up.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    uploadId: row.id,
    bucket: signed.bucket,
    path: row.storage_path,
    endpoint: signed.endpoint,
    token: signed.token,
    contentType: row.content_type,
    gameLine: formatFilmGameLine({
      gameDate: row.game_date,
      opponent: row.opponent,
      ourScore: row.our_score,
      theirScore: row.their_score,
    }),
  });
}
