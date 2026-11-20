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
import { TOKEN_LIMIT, clientIp, rateLimitTake } from "../../../lib/film/rate-limit";
import { startFilmUpload } from "../../../lib/film/upload-start";

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

  const started = await startFilmUpload(team, body);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  return NextResponse.json(started.data);
}
