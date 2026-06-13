// POST /api/reelnotes/upload
//
// Thin host glue: gates the request (ReelNotes capture is staff-only here),
// parses the multipart body, and hands the rest to the package's handleUpload —
// which stores the audio, inserts the recording, and submits to AssemblyAI. The
// AssemblyAI webhook (/api/reelnotes/transcription-webhook) takes it from there.
//
// Body: multipart/form-data
//   audio             — File (required)
//   duration_sec      — string (number)
//   source            — 'pwa' | 'native' | 'watch'
//   mime_type         — string
//   linked_ticket_id  — string (uuid, optional; host-specific task link, B3)
//
// Note: Vercel function request bodies cap at 4.5 MB. WebM/Opus from
// MediaRecorder is ~120 KB/min, so we're good up to ~30 min per upload.

import { NextRequest, NextResponse } from "next/server";
import { getViewer } from "../../../../lib/auth/viewer";
import { mccReelNotesAdapter } from "../../../../lib/reelnotes/adapter";
import { handleUpload, type UploadResult } from "reelnotes/server";

export const runtime = "nodejs";
// AssemblyAI byte upload + job submit are two sequential POSTs; 60s is ample.
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  // Host authorization policy: only staff capture recordings.
  const viewer = await getViewer();
  if (!viewer?.isStaff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form body" }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }

  const durationRaw = form.get("duration_sec");
  const durationSec = Number.isFinite(Number(durationRaw)) ? Math.max(0, Math.floor(Number(durationRaw))) : 0;
  const sourceRaw = String(form.get("source") || "pwa");
  const source = (["pwa", "native", "watch"] as const).includes(sourceRaw as "pwa")
    ? (sourceRaw as "pwa" | "native" | "watch")
    : "pwa";
  const mimeType = String(form.get("mime_type") || audio.type || "audio/webm");

  // Host-specific: optional task link (B3) — the recording attaches to a ticket
  // and onRecordingReady posts its summary there. Bogus values are dropped.
  const linkedRaw = String(form.get("linked_ticket_id") || "");
  const extraColumns = UUID_RE.test(linkedRaw) ? { linked_ticket_id: linkedRaw } : undefined;

  const result: UploadResult = await handleUpload(mccReelNotesAdapter(), {
    audio,
    durationSec,
    source,
    mimeType,
    extraColumns,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ recording: result.recording });
}
