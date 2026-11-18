// Picking a game video back up after the phone dropped it. Browser-safe:
// no server imports. The phone remembers each upload it started (keyed by a
// fingerprint of the file's bytes, not its name: iOS can hand the same video
// back under a new name) and, when the same video is picked again, asks
// /film/upload-token/resume for a fresh token and carries on from Storage's
// offset instead of sending the whole file again.

import { UNSENT_SWEEP_AFTER_MS } from "./types.ts";

/** Give up on a saved upload a little before the unsent sweep can clear it. */
export const RESUME_WINDOW_MS = UNSENT_SWEEP_AFTER_MS - 30 * 60 * 1000;

/** Bytes read from each end of the file for the fingerprint. */
export const FINGERPRINT_SAMPLE_BYTES = 1024 * 1024;

export type SavedUpload = {
  fingerprint: string;
  uploadId: string;
  uploadUrl: string;
  name: string;
  savedAt: number;
};

export function resumeStorageKey(team: string): string {
  return `olb-film-resume:${team}`;
}

/** Parse what localStorage held, dropping anything malformed or too old. */
export function parseSavedUploads(raw: string | null | undefined, now = Date.now()): SavedUpload[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((entry): entry is SavedUpload => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    return (
      typeof e.fingerprint === "string" &&
      e.fingerprint.length > 0 &&
      typeof e.uploadId === "string" &&
      e.uploadId.length > 0 &&
      typeof e.uploadUrl === "string" &&
      /^https:\/\//.test(e.uploadUrl) &&
      typeof e.name === "string" &&
      typeof e.savedAt === "number" &&
      now - e.savedAt < RESUME_WINDOW_MS
    );
  });
}

export function findSavedUpload(list: SavedUpload[], fingerprint: string): SavedUpload | null {
  return list.find((e) => e.fingerprint === fingerprint) ?? null;
}

export function upsertSavedUpload(list: SavedUpload[], entry: SavedUpload): SavedUpload[] {
  return [...list.filter((e) => e.fingerprint !== entry.fingerprint && e.uploadId !== entry.uploadId), entry];
}

export function removeSavedUpload(list: SavedUpload[], uploadId: string): SavedUpload[] {
  return list.filter((e) => e.uploadId !== uploadId);
}

/** Server-side gate for /film/upload-token/resume. */
export function resumeRefusal(
  row: { team: string; status: string; created_at: string; file_deleted_at: string | null } | null,
  teamSlug: string,
  now = Date.now()
): string | null {
  if (!row || row.team !== teamSlug) return "That upload isn't on this team.";
  if (row.status !== "holding" || row.file_deleted_at) return "That upload can't be picked back up.";
  const started = Date.parse(row.created_at);
  if (!Number.isFinite(started) || now - started >= RESUME_WINDOW_MS) {
    return "That upload is too old to pick back up.";
  }
  return null;
}

/** size + SHA-256 of the first and last MB. Cheap on a 10 GB file. */
export async function fileFingerprint(file: Blob): Promise<string> {
  const n = Math.min(FINGERPRINT_SAMPLE_BYTES, file.size);
  const head = await file.slice(0, n).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - n)).arrayBuffer();
  const joined = new Uint8Array(head.byteLength + tail.byteLength);
  joined.set(new Uint8Array(head), 0);
  joined.set(new Uint8Array(tail), head.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", joined);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${file.size}:${hex}`;
}

/** tus-js-client errors are long and technical; parents see this instead. */
export function friendlyUploadError(message: string | undefined): string {
  const raw = (message ?? "").trim();
  if (!raw) return "The upload stopped. Tap Retry to carry on.";
  if (/tus:|network|failed to fetch|xhr|timeout|offline|aborted/i.test(raw)) {
    return "The upload stopped — the phone may have locked or lost signal. It carries on from where it stopped when you come back to this page, or tap Retry.";
  }
  return raw;
}
