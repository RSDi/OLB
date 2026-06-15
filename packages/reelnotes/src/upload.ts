// Server-side upload handler — the capture entry point of the pipeline.
//
// Stores the audio bytes in the private bucket, inserts a recording row in
// 'transcribing', and hands the same bytes to AssemblyAI; the transcription
// webhook (processTranscriptionCompleted) takes it from there. Everything
// host-specific (auth gate, HTTP parsing, host-only columns) stays in the host
// route, which parses the request and calls this with plain inputs — so the
// package never imports next/server and stays portable.
//
// Privacy (B6): no public URL ever exists. The row stores a `storage:` marker;
// the returned recording carries a short-lived signed URL. AssemblyAI reads its
// own private upload_url, not our bucket.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReelNotesAdapter } from "./adapter";
import type { RecordingSource } from "./types";
import { signAudioUrl, storageAudioMarker, isStorageAudio, storageAudioPath } from "./audio-storage";

// The column set the loaders + UI expect on a recording (joins its action
// items). Lives here so the host's upload route and the package agree.
export const RECORDING_SELECT = `id, user_id, title, audio_blob_url, duration_sec, source, status,
  assemblyai_id, transcript, utterances, summary, error,
  linked_entity_type, linked_entity_id, created_at, updated_at,
  action_items:reel_notes_action_items(
    id, recording_id, text, routed_to, done, sort_order, priority,
    owner_member_id, supporter_member_ids, suggested_assignee_name, suggested_member_id,
    suggested_supporter_names, transcript_ms, created_at, updated_at
  )`;

// Header AssemblyAI echoes back on the webhook call so the host's webhook route
// can authenticate it. The value is arbitrary, but the upload submit (here) and
// the webhook check must use the same name.
export const WEBHOOK_SECRET_HEADER = "x-mcc-webhook-secret";

const AAI_UPLOAD_URL = "https://api.assemblyai.com/v2/upload";
const AAI_TRANSCRIPT_URL = "https://api.assemblyai.com/v2/transcript";

export interface UploadInput {
  audio: Blob;
  durationSec: number;
  source: RecordingSource;
  mimeType: string;
  // Host-specific columns merged into the recording insert (e.g. a task link).
  extraColumns?: Record<string, unknown>;
}

export type UploadResult =
  | { ok: true; recording: Record<string, unknown> }
  | { ok: false; status: number; error: string };

// Stores audio + inserts the recording + submits to AssemblyAI. Returns the
// recording row (with a signed audio URL) or an HTTP-shaped error for the host
// route to relay. Authorization is the host's job — call this only once allowed.
export async function handleUpload(adapter: ReelNotesAdapter, input: UploadInput): Promise<UploadResult> {
  const { config } = adapter;
  const { audio, durationSec, source, mimeType } = input;

  if (!(audio instanceof Blob) || audio.size === 0) {
    return { ok: false, status: 400, error: "Missing audio file" };
  }
  if (audio.size > config.audioMaxBytes) {
    return { ok: false, status: 413, error: "Audio file too large" };
  }

  const user = await adapter.getCurrentUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  // One read of the bytes serves both the private bucket and AssemblyAI.
  const bytes = Buffer.from(await audio.arrayBuffer());
  const ext = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  const path = `${user.id}/${Date.now()}.${ext}`;

  const admin = adapter.getAdminClient();
  const { error: storeErr } = await admin.storage
    .from(config.audioBucket)
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (storeErr) {
    console.error("ReelNotes: audio storage upload failed", storeErr);
    return { ok: false, status: 500, error: storeErr.message };
  }

  const supabase = await adapter.getServerClient();
  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    audio_blob_url: storageAudioMarker(path),
    duration_sec: durationSec,
    source,
    status: "transcribing",
    ...(input.extraColumns ?? {}),
  };
  const { data: row, error: insertError } = await supabase
    .from("reel_notes_recordings")
    .insert(insertRow)
    .select(RECORDING_SELECT)
    .single();
  if (insertError || !row) {
    console.error("ReelNotes: recording insert failed", insertError);
    return { ok: false, status: 500, error: insertError?.message || "Insert failed" };
  }
  const recordingId = (row as { id: string }).id;

  // Hand off to AssemblyAI. Without a key we still return the saved row (status
  // 'transcribing') so the audio isn't lost; the pipeline stays blocked until a
  // key is configured.
  await submitToAssemblyAI(config, supabase, recordingId, bytes);

  // The client plays audio immediately from the response — swap the storage
  // marker for a signed URL before returning.
  const recording = row as { audio_blob_url: string };
  recording.audio_blob_url = await signAudioUrl(admin, recording.audio_blob_url);
  return { ok: true, recording: row as Record<string, unknown> };
}

// Uploads the bytes to AssemblyAI's private store and submits a transcript job,
// then records the job id (status -> 'transcribing') or marks the recording
// 'failed' with the real error. Shared by the initial upload and retry so the
// submit shape (model, speaker labels, webhook) stays in one place.
async function submitToAssemblyAI(
  config: ReelNotesAdapter["config"],
  client: SupabaseClient,
  recordingId: string,
  bytes: Buffer<ArrayBuffer>,
): Promise<void> {
  // No key: keep the audio + 'transcribing' row; note why it's stuck.
  if (!config.assemblyAiKey) {
    await client.from("reel_notes_recordings").update({ error: "ASSEMBLYAI_API_KEY not set" }).eq("id", recordingId);
    return;
  }
  try {
    // Push the bytes to AssemblyAI's own store — the returned upload_url is
    // readable only by their transcript API, so nothing public is created.
    const uploadRes = await fetch(AAI_UPLOAD_URL, {
      method: "POST",
      headers: { authorization: config.assemblyAiKey, "content-type": "application/octet-stream" },
      body: bytes,
    });
    const uploadBody = (await uploadRes.json()) as { upload_url?: string; error?: string };
    if (!uploadRes.ok || !uploadBody.upload_url) {
      throw new Error(uploadBody.error || `AssemblyAI upload HTTP ${uploadRes.status}`);
    }

    const aaiRes = await fetch(AAI_TRANSCRIPT_URL, {
      method: "POST",
      headers: { authorization: config.assemblyAiKey, "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: uploadBody.upload_url,
        speech_models: ["universal-3-pro"],
        speaker_labels: true,
        webhook_url: `${config.baseUrl}/api/reelnotes/transcription-webhook`,
        ...(config.webhookSecret
          ? { webhook_auth_header_name: WEBHOOK_SECRET_HEADER, webhook_auth_header_value: config.webhookSecret }
          : {}),
      }),
    });
    const aaiBody = (await aaiRes.json()) as { id?: string; error?: string };
    if (aaiRes.ok && aaiBody.id) {
      await client
        .from("reel_notes_recordings")
        .update({ assemblyai_id: aaiBody.id, status: "transcribing", error: null })
        .eq("id", recordingId);
    } else {
      throw new Error(aaiBody.error || `AssemblyAI HTTP ${aaiRes.status}`);
    }
  } catch (err) {
    console.error("ReelNotes: AssemblyAI submission failed", err);
    await client
      .from("reel_notes_recordings")
      .update({ status: "failed", error: err instanceof Error ? err.message : "AssemblyAI error" })
      .eq("id", recordingId);
  }
}

// Re-submit a failed recording's stored audio for a fresh transcription.
// AssemblyAI errors are often transient, so re-uploading the same bytes and
// starting a new job usually clears them. Returns ok, or a reason it couldn't.
export async function retryTranscription(
  adapter: ReelNotesAdapter,
  recordingId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { config } = adapter;
  const admin = adapter.getAdminClient();

  const { data: rec } = await admin
    .from("reel_notes_recordings")
    .select("id, audio_blob_url")
    .eq("id", recordingId)
    .is("deleted_at", null)
    .maybeSingle();
  const recording = rec as { id: string; audio_blob_url: string | null } | null;
  if (!recording) return { ok: false, error: "Recording not found" };

  // Only the new private-bucket recordings keep re-fetchable bytes; pre-B6
  // recordings in Vercel Blob can't be re-submitted this way.
  if (!isStorageAudio(recording.audio_blob_url)) {
    return { ok: false, error: "This recording's audio isn't available to retry." };
  }
  const { data: blob, error: dlErr } = await admin.storage
    .from(config.audioBucket)
    .download(storageAudioPath(recording.audio_blob_url as string));
  if (dlErr || !blob) return { ok: false, error: dlErr?.message ?? "Could not read the stored audio." };
  const bytes = Buffer.from(await blob.arrayBuffer());

  // Flip to 'transcribing' (clearing the old job + error) so polling clients
  // show progress, then re-submit — which sets the new id or flips back to failed.
  await admin
    .from("reel_notes_recordings")
    .update({ status: "transcribing", error: null, assemblyai_id: null })
    .eq("id", recordingId);
  await submitToAssemblyAI(config, admin, recordingId, bytes);
  return { ok: true };
}
