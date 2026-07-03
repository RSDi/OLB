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
  storage_path: string | null; // null if the download failed — permalink still works
  permalink: string;
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
    permalink: file.permalink,
  };

  try {
    const res = await fetch(file.url_private, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return base;
    const bytes = await res.arrayBuffer();

    const path = `${channelId}/${ts}/${file.id}-${file.name}`;
    const { error } = await admin.storage
      .from(ARCHIVE_FILES_BUCKET)
      .upload(path, bytes, { contentType: file.mimetype, upsert: true });
    if (error) {
      console.error("[slack-archive] file upload failed:", error.message);
      return base;
    }
    return { ...base, storage_path: path };
  } catch (err) {
    console.error("[slack-archive] file download failed:", err);
    return base;
  }
}

export async function signArchiveFileUrl(admin: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(ARCHIVE_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("[slack-archive] signing file URL failed:", error?.message);
    return null;
  }
  return data.signedUrl;
}
