// Read-only YouTube / playlist health for game film. Same Bearer agent key
// as GET /api/agent/film. Never returns OAuth tokens or team codes.

import { NextResponse } from "next/server";
import { agentDeny } from "../../../../../lib/agent/auth-http";
import { agentPayloadLeaks } from "../../../../../lib/agent/film";
import { loadAgentFilmHealth } from "../../../../../lib/agent/film-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await agentDeny(request, { scope: "read" });
  if (denied) return denied;

  try {
    const body = await loadAgentFilmHealth();
    const leaks = agentPayloadLeaks(body);
    if (leaks.length) {
      console.error("[agent/film/health] refused to return secret fields", leaks);
      return NextResponse.json({ error: "Couldn't load film health." }, { status: 500 });
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("[agent/film/health GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't load film health." }, { status: 500 });
  }
}
