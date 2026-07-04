// File attachment download/storage for the Slack archive.
//
// Slack file URLs (url_private) require the bot token and can go stale if
// the file is deleted in Slack, so attachments are copied into a private
// Supabase Storage bucket at archive time. Mirrors the marker/signed-URL
// pattern in packages/reelnotes/src/audio-storage.ts, applied to the
// `slack-archive-files` bucket instead.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SlackFile } from "./slack-api";

export const ARCHIVE_FILES_BUCKET = "slack-archive-files";

// One hour: comfortably outlives a browsing session; a reload mints a new one.
const SIGNED_URL_TTL_SECONDS = 3600;

export interface ArchivedFile {
  id: string;
  name: string;
  mimetype: string;
  size: number;
  storage_path: string | null; // null if the download failed — permalink is kept as a fallback,
  permalink: string | null;    // though Slack permalinks require a logged-in session in the workspace,
                                // and some degraded file objects have no permalink at all either
  error: string | null;        // why storage_path is null, for the "needs attention" panel; null on success
}

// Supabase Storage keys are S3-compatible and reject some characters Slack
// happily allows in a file name (em dashes, commas, etc. have been seen to
// fail with "Invalid key" in practice). Sanitize for the storage path only —
// the original name is kept in ArchivedFile.name for display.
function sanitizeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 150);
}

export async function downloadAndStoreSlackFile(
  admin: SupabaseClient,
  file: SlackFile,
  channelId: string,
  ts: string,
  token: string,
): Promise<ArchivedFile> {
  const base: ArchivedFile = {
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    size: file.size,
    storage_path: null,
    permalink: file.permalink ?? null,
    error: null,
  };

  // Some Slack file objects (e.g. certain external/unfurled files) carry no
  // url_private at all — nothing to download, fall back to the permalink.
  if (!file.url_private) {
    const reason = "No downloadable URL provided by Slack for this file type.";
    console.warn(`[slack-archive] file ${file.id} has no url_private, skipping download`);
    return { ...base, error: reason };
  }

  try {
    const res = await fetch(file.url_private, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const reason = `Download failed: HTTP ${res.status}`;
      console.warn(`[slack-archive] ${reason} for file ${file.id}`);
      return { ...base, error: reason };
    }
    const bytes = await res.arrayBuffer();

    const path = `${channelId}/${ts}/${file.id}-${sanitizeFileName(file.name)}`;
    const { error } = await admin.storage
      .from(ARCHIVE_FILES_BUCKET)
      .upload(path, bytes, { contentType: file.mimetype, upsert: true });
    if (error) {
      console.error("[slack-archive] file upload failed:", error.message);
      return { ...base, error: `Upload failed: ${error.message}` };
    }
    return { ...base, storage_path: path };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[slack-archive] file download failed:", err);
    return { ...base, error: `Download error: ${message}` };
  }
}

// Batched — one Storage API round trip for however many files a channel page
// needs to render, rather than one call per file.
export async function signArchiveFileUrls(admin: SupabaseClient, storagePaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (storagePaths.length === 0) return result;

  const { data, error } = await admin.storage
    .from(ARCHIVE_FILES_BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.error("[slack-archive] signing file URLs failed:", error?.message);
    return result;
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}
