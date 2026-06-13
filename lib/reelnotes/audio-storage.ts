// Private audio storage for ReelNotes recordings (B6 / finding S9).
//
// Meeting audio used to live in PUBLIC Vercel blobs — unguessable URLs, but
// no auth and no expiry, for recordings that can contain finances or
// personnel talk. New recordings go to a PRIVATE Supabase Storage bucket;
// the DB stores a `storage:` marker instead of a URL, and server code swaps
// it for a short-lived signed URL whenever the owner loads the page. The
// transcription leg never needs a URL at all — bytes are pushed straight to
// AssemblyAI's private upload endpoint.
//
// Rows whose audio_blob_url is a plain https URL are pre-B6 recordings still
// in Vercel Blob; they pass through untouched (and hard-delete still cleans
// them up via @vercel/blob del()).

import type { SupabaseClient } from "@supabase/supabase-js";

export const AUDIO_BUCKET = "reel-notes-audio";
const MARKER_PREFIX = `storage:${AUDIO_BUCKET}/`;

// One hour: comfortably outlives a listening session; a reload mints a new one.
const SIGNED_URL_TTL_SECONDS = 3600;

export function isStorageAudio(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith(MARKER_PREFIX));
}

export function storageAudioPath(marker: string): string {
  return marker.slice(MARKER_PREFIX.length);
}

export function storageAudioMarker(path: string): string {
  return `${MARKER_PREFIX}${path}`;
}

// Marker → signed https URL (service-role client required; the bucket is
// private and has no read policies on purpose). Non-markers pass through.
export async function signAudioUrl(
  admin: SupabaseClient,
  value: string,
): Promise<string> {
  if (!isStorageAudio(value)) return value;
  const path = storageAudioPath(value);
  const { data, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[reel-notes] signing audio URL failed:", error?.message);
    return value; // the marker — unplayable, but the row still renders
  }
  return data.signedUrl;
}
