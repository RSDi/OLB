// POST /film/session — unlock a team upload page with the shared code.
// Sets the signed olb_film cookie. Bytes never land here.

import { NextResponse } from "next/server";
import { FILM_COOKIE, checkFilmTeamCode, encodeFilmSession, filmCookieOptions } from "../../../lib/film/session";
import { getFilmTeamBySlug } from "../../../lib/film/teams";
import { UNLOCK_LIMIT, clientIp, rateLimitTake } from "../../../lib/film/rate-limit";
import { requestIsHttps } from "../../../lib/auth/pairing-cookie";

export async function POST(request: Request) {
  let body: { team?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the team and the code." }, { status: 400 });
  }
  const slug = typeof body.team === "string" ? body.team.trim().toLowerCase() : "";
  let team;
  try {
    team = slug ? await getFilmTeamBySlug(slug) : null;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't check that team." },
      { status: 500 }
    );
  }
  if (!team || !team.enabled) {
    return NextResponse.json({ error: "That team isn't set up for film." }, { status: 404 });
  }

  const ip = clientIp(request.headers);
  const limited = rateLimitTake(`film-unlock:${ip}`, UNLOCK_LIMIT);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many tries. Wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const result = checkFilmTeamCode(team, body.code);
  if (result === "unset") {
    return NextResponse.json({ error: "That team isn't set up for film." }, { status: 404 });
  }
  if (result !== "ok") {
    return NextResponse.json({ error: "That code doesn't match." }, { status: 401 });
  }

  const value = encodeFilmSession(team.slug, team.codeVersion);
  if (!value) {
    return NextResponse.json(
      { error: "Film uploads aren't configured (missing FILM_SESSION_SECRET)." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, team: team.slug });
  res.cookies.set(
    FILM_COOKIE,
    value,
    filmCookieOptions(requestIsHttps(request.headers, new URL(request.url).protocol))
  );
  return res;
}
