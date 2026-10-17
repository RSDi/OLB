// POST /film/upload-token — validate, log a holding row, mint a short-lived
// signed TUS token with the service-role key. The browser then uploads
// straight to Supabase Storage. This route never sees the file bytes.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FILM_COOKIE, parseFilmSession } from "../../../lib/film/session";
import { teamCode } from "../../../lib/film/teams";
import { validateUploadInput } from "../../../lib/film/validation";
import { TOKEN_LIMIT, clientIp, rateLimitTake } from "../../../lib/film/rate-limit";
import { filmStorage } from "../../../lib/film/storage";
import { filmStoragePath, insertHoldingUpload, newUploadId } from "../../../lib/film/uploads";
import { GAME_FILM_BUCKET } from "../../../lib/film/types";

export async function POST(request: Request) {
  const store = await cookies();
  const team = parseFilmSession(store.get(FILM_COOKIE)?.value);
  if (!team || !teamCode(team)) {
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
  const path = filmStoragePath(team, id, checked.filename);
  let minted;
  try {
    minted = await filmStorage().mintUpload({ path, contentType: checked.contentType });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't start the upload.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  try {
    await insertHoldingUpload({
      id,
      team,
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

  return NextResponse.json({
    uploadId: id,
    bucket: minted.bucket || GAME_FILM_BUCKET,
    path: minted.path,
    endpoint: minted.endpoint,
    token: minted.token,
    contentType: checked.contentType,
  });
}
