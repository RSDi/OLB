// Shared 401 / service-role gates for the Product Manager bot's routes.
// NextResponse lives here so the pure checks in ./bot.ts stay testable.

import { NextResponse } from "next/server";
import { ROADMAP_BOT_TOKEN_ENV, roadmapBotAuthorized } from "./bot";

export function roadmapBotDeny(request: Request): NextResponse | null {
  const expected = process.env[ROADMAP_BOT_TOKEN_ENV];
  if (!roadmapBotAuthorized(request.headers.get("authorization"), expected)) {
    if (!expected) console.error(`roadmap-items: ${ROADMAP_BOT_TOKEN_ENV} not configured`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export function roadmapBotNeedServiceRole(): NextResponse | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return NextResponse.json(
    { error: "SUPABASE_SERVICE_ROLE_KEY not set; the roadmap bot cannot read or write items (RLS blocks unauthenticated writes)." },
    { status: 500 },
  );
}
