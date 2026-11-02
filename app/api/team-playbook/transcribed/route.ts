// POST /api/team-playbook/transcribed
//
// AssemblyAI calls this when it has written down what the coach says in a
// Team Playbook video ({ transcript_id, status }). The play then moves on to
// being read (lib/team-playbook/pipeline.ts), after the response so
// AssemblyAI isn't kept waiting. Authenticated with the same shared header as
// the ReelNotes webhook.

import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { advancePlay, WEBHOOK_SECRET_HEADER } from "../../../../lib/team-playbook/pipeline";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (secret && req.headers.get(WEBHOOK_SECRET_HEADER) !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { transcript_id?: string };
  try {
    body = (await req.json()) as { transcript_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.transcript_id) return NextResponse.json({ error: "Missing transcript_id" }, { status: 400 });

  const admin = createAdminClient();
  const { data } = await admin.from("team_plays").select("id").eq("assemblyai_id", body.transcript_id).maybeSingle();
  if (!data) return NextResponse.json({ ok: true, skipped: "unknown_transcript" });
  after(() => advancePlay(data.id as string));
  return NextResponse.json({ ok: true });
}
