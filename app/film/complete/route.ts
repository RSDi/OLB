// POST /film/complete — the browser finished TUS. The row is already
// holding; this just confirms the id belongs to this team session.

import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { FILM_COOKIE, parseFilmSession, sessionMatchesTeam } from "../../../lib/film/session";
import { getFilmTeamBySlug } from "../../../lib/film/teams";
import { getFilmUpload } from "../../../lib/film/uploads";
import type { UploadStatsInput } from "../../../lib/film/upload-stats";
import { kickFilmUploadComplete } from "../../../lib/film/upload-start";

export const maxDuration = 60;

export async function POST(request: Request) {
  const store = await cookies();
  const session = parseFilmSession(store.get(FILM_COOKIE)?.value);
  const team = session ? await getFilmTeamBySlug(session.slug).catch(() => null) : null;
  if (!session || !sessionMatchesTeam(session, team)) {
    return NextResponse.json({ error: "Unlock this team with the shared code first." }, { status: 401 });
  }
  let body: { uploadId?: unknown; stats?: UploadStatsInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  }
  const id = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!id) return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  const row = await getFilmUpload(id);
  if (!row || row.team !== session.slug) {
    return NextResponse.json({ error: "That upload isn't on this team." }, { status: 404 });
  }
  after(() => kickFilmUploadComplete(row, body.stats));
  return NextResponse.json({ ok: true, status: row.status });
}
