// POST /api/reelnotes/transcription-webhook
//
// Called by AssemblyAI when a transcription job finishes. Payload shape:
//   { transcript_id: string, status: "completed" | "error" }
//
// We look up the matching recording by assemblyai_id, then hand off to the
// pipeline module which fetches the full transcript, runs LLM extraction,
// inserts action items, and emails the user.
//
// Auth: the upload route sets webhook_auth_header_name/value on job submit
// (when ASSEMBLYAI_WEBHOOK_SECRET is configured) and AssemblyAI echoes the
// header back here. With the env var set, calls without the matching header
// are rejected. Without it we accept-and-warn so jobs submitted before the
// secret existed still complete; set the env var to enforce.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { processTranscriptionCompleted, WEBHOOK_SECRET_HEADER } from "reelnotes/server";
import { mccReelNotesAdapter } from "../../../../lib/reelnotes/adapter";

export const runtime = "nodejs";
// Pipeline runs transcript fetch + Claude call + Resend email inline. Bump
// the limit so a slow LLM response doesn't blow past 60s.
export const maxDuration = 180;

interface AAIWebhookBody {
  transcript_id?: string;
  status?: "completed" | "error";
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET;
  if (expectedSecret) {
    if (req.headers.get(WEBHOOK_SECRET_HEADER) !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else {
    console.warn(
      "transcription-webhook: ASSEMBLYAI_WEBHOOK_SECRET not set — accepting unverified webhook"
    );
  }

  let body: AAIWebhookBody;
  try {
    body = (await req.json()) as AAIWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcriptId = body.transcript_id;
  if (!transcriptId) {
    return NextResponse.json({ error: "Missing transcript_id" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: lookupErr } = await admin
    .from("reel_notes_recordings")
    .select("id, status")
    .eq("assemblyai_id", transcriptId)
    .maybeSingle();

  if (lookupErr || !row) {
    // Unknown transcript_id — could be a stale/leaked webhook, just 200 so
    // AssemblyAI stops retrying.
    console.warn("Webhook: no recording for transcript", transcriptId, lookupErr);
    return NextResponse.json({ ok: true, skipped: "unknown_transcript" });
  }
  const recording = row as { id: string; status: string };

  // Defer to the pipeline for BOTH completed and error transcripts. It fetches
  // the transcript from AssemblyAI and, on error, stores AssemblyAI's real
  // error message (e.g. the actual failure reason) instead of a generic one —
  // so failed recordings are debuggable and the UI can show why.
  await processTranscriptionCompleted(recording.id, mccReelNotesAdapter());
  return NextResponse.json({ ok: true });
}
