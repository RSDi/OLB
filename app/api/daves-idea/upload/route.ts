// POST /api/daves-idea/upload
//
// Accepts an audio file from the client (browser MediaRecorder), stores it
// in Vercel Blob, inserts a daves_idea_recordings row in 'transcribing'
// status, and submits the audio to AssemblyAI for transcription. The
// AssemblyAI webhook (/api/daves-idea/transcription-webhook) takes it from
// there.
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
import { put } from "@vercel/blob";
import { createClient } from "../../../../lib/supabase/server";
import { getViewer } from "../../../../lib/auth/viewer";

export const runtime = "nodejs";
// Default 300s is plenty; AssemblyAI submit is a single POST.
export const maxDuration = 60;

const RECORDING_SELECT = `id, user_id, title, audio_blob_url, duration_sec, source, status,
  assemblyai_id, transcript, utterances, error, created_at, updated_at,
  action_items:daves_idea_action_items(
    id, recording_id, text, routed_to, done, sort_order,
    owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
    created_at, updated_at
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

  const durationRaw = form.get("duration_sec");
  const duration = Number.isFinite(Number(durationRaw)) ? Math.max(0, Math.floor(Number(durationRaw))) : 0;
  const sourceRaw = String(form.get("source") || "pwa");
  const source = (["pwa", "native", "watch"] as const).includes(sourceRaw as "pwa")
    ? (sourceRaw as "pwa" | "native" | "watch")
    : "pwa";
  const mimeType = String(form.get("mime_type") || audio.type || "audio/webm");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Storage not configured — set BLOB_READ_WRITE_TOKEN" },
      { status: 503 }
    );
  }

  // Upload to Vercel Blob. URLs are public but unguessable; AssemblyAI
  // fetches via the URL during transcription.
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  const pathname = `daves-idea/${viewer.userId}/${Date.now()}.${ext}`;

  let blobUrl: string;
  try {
    const uploaded = await put(pathname, audio, {
      access: "public",
      contentType: mimeType,
    });
    blobUrl = uploaded.url;
  } catch (err) {
    console.error("Blob upload failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blob upload failed" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { data: row, error: insertError } = await supabase
    .from("daves_idea_recordings")
    .insert({
      user_id: viewer.userId,
      audio_blob_url: blobUrl,
      duration_sec: duration,
      source,
      status: "transcribing",
    })
    .select(RECORDING_SELECT)
    .single();

  if (insertError || !row) {
    console.error("Recording insert failed", insertError);
    return NextResponse.json(
      { error: insertError?.message || "Insert failed" },
      { status: 500 }
    );
  }

  // Hand off to AssemblyAI. If the key isn't set we still return the row so
  // the client can show it in 'transcribing' (the user can see the audio
  // attached); they'll need to add the key to unblock the pipeline.
  const aaiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!aaiKey) {
    await supabase
      .from("daves_idea_recordings")
      .update({ error: "ASSEMBLYAI_API_KEY not set" })
      .eq("id", (row as { id: string }).id);
    return NextResponse.json({ recording: row });
  }

  try {
    const aaiRes = await fetch("https://api.assemblyai.com/v2/transcript", {
      method: "POST",
      headers: {
        authorization: aaiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: blobUrl,
        speech_models: ["universal-3-pro"],
        speaker_labels: true,
        webhook_url: `${baseUrl()}/api/daves-idea/transcription-webhook`,
      }),
    });
    const aaiBody = (await aaiRes.json()) as { id?: string; error?: string };
    if (aaiRes.ok && aaiBody.id) {
      await supabase
        .from("daves_idea_recordings")
        .update({ assemblyai_id: aaiBody.id })
        .eq("id", (row as { id: string }).id);
    } else {
      console.error("AssemblyAI submission failed", aaiBody);
      await supabase
        .from("daves_idea_recordings")
        .update({
          status: "failed",
          error: aaiBody.error || `AssemblyAI HTTP ${aaiRes.status}`,
        })
        .eq("id", (row as { id: string }).id);
    }
  } catch (err) {
    console.error("AssemblyAI fetch error", err);
    await supabase
      .from("daves_idea_recordings")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : "AssemblyAI error",
      })
      .eq("id", (row as { id: string }).id);
  }

  return NextResponse.json({ recording: row });
}
