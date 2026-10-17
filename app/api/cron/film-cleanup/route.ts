// Vercel Cron: delete game-film files 30 days after a coach marked them moved.
// Auth is the same Bearer CRON_SECRET as the other /api/cron routes.

import { NextResponse } from "next/server";
import { cleanupMovedFilm } from "../../../../lib/film/cleanup";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("film-cleanup: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY not set; cron cannot delete moved game film (RLS blocks unauthenticated writes).",
      },
      { status: 500 }
    );
  }

  try {
    const result = await cleanupMovedFilm();
    return NextResponse.json({ timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cleanup failed" },
      { status: 500 }
    );
  }
}
