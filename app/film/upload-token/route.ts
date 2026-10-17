// POST /film/upload-token — validate the team-code session, log a holding
// row, mint a short-lived signed upload token with the service-role key
// (createSignedUploadUrl), then create the TUS upload on Storage from this
// server. The browser PATCHes file bytes to the returned Location. This
// route never sees the file bytes and never sends the service-role key to
// the client.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FILM_COOKIE, parseFilmSession, sessionMatchesTeam } from "../../../lib/film/session";
import { getFilmTeamBySlug } from "../../../lib/film/teams";
import { validateUploadInput } from "../../../lib/film/validation";
import { TOKEN_LIMIT, clientIp, rateLimitTake } from "../../../lib/film/rate-limit";
import { filmStorage } from "../../../lib/film/storage";
import { filmStoragePath, insertHoldingUpload, newUploadId } from "../../../lib/film/uploads";
import { GAME_FILM_BUCKET } from "../../../lib/film/types";

export async function POST(request: Request) {
  const store = await cookies();
  const session = parseFilmSession(store.get(FILM_COOKIE)?.value);
  const team = session ? await getFilmTeamBySlug(session.slug).catch(() => null) : null;
  if (!sessionMatchesTeam(session, team) || !team) {
    return NextResponse.json({ error: "Unlock this team with the shared code first." }, { status: 401 });
  }

  const ip = clientIp(request.headers);
  const limited = rateLimitTake(`film-token:${ip}`, TOKEN_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the file details as JSON." }, { status: 400 });
  }

  const checked = validateUploadInput({
    uploaderName: body.uploaderName,
    filename: body.filename,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
  });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const id = newUploadId();
  const path = filmStoragePath(team.slug, id, checked.filename);
  let minted;
  try {
    minted = await filmStorage().mintUpload({
      path,
      contentType: checked.contentType,
      sizeBytes: checked.sizeBytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start the upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await insertHoldingUpload({
      id,
      team: team.slug,
      teamId: team.id,
      uploaderName: checked.uploaderName,
      filename: checked.filename,
      contentType: checked.contentType,
      sizeBytes: checked.sizeBytes,
      storagePath: minted.path,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't log the upload." },
      { status: 500 }
    );
  }

  if (!minted.uploadUrl) {
    return NextResponse.json({ error: "Couldn't start the resumable upload." }, { status: 500 });
  }

  return NextResponse.json({
    uploadId: id,
    bucket: minted.bucket || GAME_FILM_BUCKET,
    path: minted.path,
    endpoint: minted.endpoint,
    token: minted.token,
    uploadUrl: minted.uploadUrl,
    contentType: checked.contentType,
  });
}
