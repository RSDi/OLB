// POST /api/reelnotes/upload
//
// Accepts an audio file from the client (browser MediaRecorder), stores it
// in the PRIVATE reel-notes-audio bucket (Supabase Storage), inserts a
// daves_idea_recordings row in 'transcribing' status, and pushes the same
// bytes to AssemblyAI's upload endpoint for transcription. The AssemblyAI
// webhook (/api/reelnotes/transcription-webhook) takes it from there.
//
// Privacy (B6): no public URL ever exists for new recordings. The DB holds a
// `storage:` marker; this response and the page loaders swap it for a
// short-lived signed URL. AssemblyAI reads its own private upload_url, not
// our storage.
//
// Body: multipart/form-data
//   audio         — File (required)
//   duration_sec  — string (number)
//   source        — 'pwa' | 'native' | 'watch'
//   mime_type     — string
//
// Note: Vercel function request bodies cap at 4.5 MB. WebM/Opus from
// MediaRecorder is roughly ~120 KB/min, so we're good up to ~30 min of
// audio per upload. Longer-than-30-min recordings will need client-uploads.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getViewer } from "../../../../lib/auth/viewer";
import {
  AUDIO_BUCKET,
  signAudioUrl,
  storageAudioMarker,
} from "reelnotes";

export const runtime = "nodejs";
// AssemblyAI byte upload + job submit are two sequential POSTs; 60s is ample.
export const maxDuration = 60;

const RECORDING_SELECT = `id, user_id, title, audio_blob_url, duration_sec, source, status,
  assemblyai_id, transcript, utterances, summary, error, created_at, updated_at,
  action_items:daves_idea_action_items(
    id, recording_id, text, routed_to, done, sort_order, priority,
    owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
    suggested_supporter_names, transcript_ms, created_at, updated_at
  )`;

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function POST(req: NextRequest) {
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
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
  }
  // Vercel already caps function bodies at 4.5 MB; this explicit guard keeps
  // the limit enforced if uploads ever move to client-uploads/streaming.
  if (audio.size > 30 * 1024 * 1024) {
    return NextResponse.json({ error: "Audio file too large" }, { status: 413 });
  }

  const durationRaw = form.get("duration_sec");
  const duration = Number.isFinite(Number(durationRaw)) ? Math.max(0, Math.floor(Number(durationRaw))) : 0;
  const sourceRaw = String(form.get("source") || "pwa");
  const source = (["pwa", "native", "watch"] as const).includes(sourceRaw as "pwa")
    ? (sourceRaw as "pwa" | "native" | "watch")
    : "pwa";
  const mimeType = String(form.get("mime_type") || audio.type || "audio/webm");
  // B3: optional task link — the recording attaches to a ticket and the
  // pipeline posts its summary there. Validated as a UUID; bogus values are
  // simply dropped rather than failing the upload.
  const linkedRaw = String(form.get("linked_ticket_id") || "");
  const linkedTicketId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(linkedRaw)
    ? linkedRaw
    : null;

  // One read of the bytes serves both the private bucket and AssemblyAI.
  const bytes = Buffer.from(await audio.arrayBuffer());
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  const path = `${viewer.userId}/${Date.now()}.${ext}`;

  const admin = createAdminClient();
  const { error: storeErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (storeErr) {
    console.error("Audio storage upload failed", storeErr);
    return NextResponse.json({ error: storeErr.message }, { status: 500 });
  }

  const supabase = await createClient();
  const baseRow: Record<string, unknown> = {
    user_id: viewer.userId,
    audio_blob_url: storageAudioMarker(path),
    duration_sec: duration,
    source,
    status: "transcribing",
  };
  const insertRow: Record<string, unknown> = { ...baseRow };
  if (linkedTicketId) insertRow.linked_ticket_id = linkedTicketId;
  let { data: row, error: insertError } = await supabase
    .from("daves_idea_recordings")
    .insert(insertRow)
    .select(RECORDING_SELECT)
    .single();

  // Pre-0052 grace: if the link column doesn't exist yet, save the recording
  // unlinked rather than losing the audio.
  if (insertError && linkedTicketId && /linked_ticket_id/.test(insertError.message)) {
    console.warn("linked_ticket_id column missing (migration 0052) — saving unlinked");
    ({ data: row, error: insertError } = await supabase
      .from("daves_idea_recordings")
      .insert(baseRow)
      .select(RECORDING_SELECT)
      .single());
  }

  if (insertError || !row) {
    console.error("Recording insert failed", insertError);
    return NextResponse.json(
      { error: insertError?.message || "Insert failed" },
      { status: 500 }
    );
  }
  const recordingId = (row as { id: string }).id;

  // Hand off to AssemblyAI. If the key isn't set we still return the row so
  // the client can show it in 'transcribing' (the user can see the audio
  // attached); they'll need to add the key to unblock the pipeline.
  const aaiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!aaiKey) {
    await supabase
      .from("daves_idea_recordings")
      .update({ error: "ASSEMBLYAI_API_KEY not set" })
      .eq("id", recordingId);
  } else {
    try {
      // Push the bytes to AssemblyAI's own store — the returned upload_url is
      // readable only by their transcript API, so nothing public is created.
      const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
        method: "POST",
        headers: { authorization: aaiKey, "content-type": "application/octet-stream" },
        body: bytes,
      });
      const uploadBody = (await uploadRes.json()) as { upload_url?: string; error?: string };
      if (!uploadRes.ok || !uploadBody.upload_url) {
        throw new Error(uploadBody.error || `AssemblyAI upload HTTP ${uploadRes.status}`);
      }

      const aaiRes = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: {
          authorization: aaiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          audio_url: uploadBody.upload_url,
          speech_models: ["universal-3-pro"],
          speaker_labels: true,
          webhook_url: `${baseUrl()}/api/reelnotes/transcription-webhook`,
          // AssemblyAI echoes this header back on the webhook call; the route
          // rejects calls without it once the env var is set.
          ...(process.env.ASSEMBLYAI_WEBHOOK_SECRET
            ? {
                webhook_auth_header_name: "x-mcc-webhook-secret",
                webhook_auth_header_value: process.env.ASSEMBLYAI_WEBHOOK_SECRET,
              }
            : {}),
        }),
      });
      const aaiBody = (await aaiRes.json()) as { id?: string; error?: string };
      if (aaiRes.ok && aaiBody.id) {
        await supabase
          .from("daves_idea_recordings")
          .update({ assemblyai_id: aaiBody.id })
          .eq("id", recordingId);
      } else {
        throw new Error(aaiBody.error || `AssemblyAI HTTP ${aaiRes.status}`);
      }
    } catch (err) {
      console.error("AssemblyAI submission failed", err);
      await supabase
        .from("daves_idea_recordings")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "AssemblyAI error",
        })
        .eq("id", recordingId);
    }
  }

  // The client plays audio immediately from the response — swap the storage
  // marker for a signed URL before returning.
  const recording = row as { audio_blob_url: string };
  recording.audio_blob_url = await signAudioUrl(admin, recording.audio_blob_url);
  return NextResponse.json({ recording: row });
}
