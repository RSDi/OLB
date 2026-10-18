// Read-only agent list of game film. Auth is
// `Authorization: Bearer <key>` where the key was minted in Settings →
// Agent keys (hashed; plaintext is never stored). GET only.

import { NextResponse } from "next/server";
import { agentDeny } from "../../../../lib/agent/auth-http";
import { agentPayloadLeaks, parseFilmListQuery } from "../../../../lib/agent/film";
import { listAgentFilms } from "../../../../lib/agent/film-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await agentDeny(request, { scope: "read" });
  if (denied) return denied;

  const query = parseFilmListQuery(new URL(request.url).searchParams);
  if ("error" in query) return NextResponse.json({ error: query.error }, { status: 400 });

  try {
    const films = await listAgentFilms(query);
    const body = { films };
    const leaks = agentPayloadLeaks(body);
    if (leaks.length) {
      console.error("[agent/film] refused to return secret fields", leaks);
      return NextResponse.json({ error: "Couldn't list film." }, { status: 500 });
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("[agent/film GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't list film." }, { status: 500 });
  }
}
