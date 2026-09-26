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
  // Slack only had a tombstone for this file by the time the archive saw it.
  // There's nothing to download and nothing anyone can fix, so the
  // exceptions page counts these rather than listing them.
  deleted_in_slack?: boolean;
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

export interface FileTransformResult {
  bytes: ArrayBuffer | Buffer;
  mimetype: string;
  name: string;
}

export interface DownloadAndStoreOptions {
  // Optional hook to rewrite the downloaded bytes before upload — e.g. video
  // compression for oversized files. Deliberately dependency-injected rather
  // than called directly here: anything heavy enough to need its own native
  // binary (ffmpeg) has no business being a static import of this module,
  // since files.ts is imported by the live channel-viewer page as well as
  // the sync engine, and every one of those callers would otherwise ship
  // that dependency in its own bundle. Only scripts/slack-archive-compress-
  // large-files.ts currently supplies one. Returning null/undefined leaves
  // the original bytes untouched.
  transform?: (bytes: ArrayBuffer, file: SlackFile) => Promise<FileTransformResult | null | undefined>;
}

export async function downloadAndStoreSlackFile(
  admin: SupabaseClient,
  file: SlackFile,
  channelId: string,
  ts: string,
  token: string,
  opts: DownloadAndStoreOptions = {},
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

  // No url_private means nothing to download: a placeholder for a file
  // Slack deleted or is hiding (see SlackFile.mode), or one of the external/
  // unfurled file types that never have one. The permalink, if any, is kept
  // as a fallback. "Before it was archived" holds for both placeholders
  // because a file the archive already saved is never downloaded again
  // (see archiveMessageFiles).
  if (!file.url_private) {
    console.warn(`[slack-archive] file ${file.id} has no url_private (mode ${file.mode ?? "none"}), skipping download`);
    if (file.mode === "tombstone") {
      return { ...base, error: "Deleted in Slack before it was archived.", deleted_in_slack: true };
    }
    if (file.mode === "hidden_by_limit") {
      return { ...base, error: "Hidden by Slack's plan limit before it was archived." };
    }
    return { ...base, error: "No downloadable URL provided by Slack for this file type." };
  }

  try {
    const res = await fetch(file.url_private, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const reason = `Download failed: HTTP ${res.status}`;
      console.warn(`[slack-archive] ${reason} for file ${file.id}`);
      return { ...base, error: reason };
    }
    const bytes = await res.arrayBuffer();

    let uploadBytes: ArrayBuffer | Buffer = bytes;
    let uploadMimetype = file.mimetype;
    let uploadName = file.name;
    if (opts.transform) {
      // Caught here, not by the catch-all below: the download worked, so a
      // failed transform (ffmpeg rejecting a video) shouldn't be reported
      // as a download error.
      let transformed: FileTransformResult | null | undefined;
      try {
        transformed = await opts.transform(bytes, file);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[slack-archive] file processing failed:", err);
        return { ...base, error: `Processing failed: ${message}` };
      }
      if (transformed) {
        uploadBytes = transformed.bytes;
        uploadMimetype = transformed.mimetype;
        uploadName = transformed.name;
      }
    }

    const path = `${channelId}/${ts}/${file.id}-${sanitizeFileName(uploadName)}`;
    const { error } = await admin.storage
      .from(ARCHIVE_FILES_BUCKET)
      .upload(path, uploadBytes, { contentType: uploadMimetype, upsert: true });
    if (error) {
      console.error("[slack-archive] file upload failed:", error.message);
      return { ...base, error: `Upload failed: ${error.message}` };
    }
    return {
      ...base,
      storage_path: path,
      name: uploadName,
      mimetype: uploadMimetype,
      size: uploadBytes.byteLength,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[slack-archive] file download failed:", err);
    return { ...base, error: `Download error: ${message}` };
  }
}

// The files to save for a message that may already be archived. A file the
// archive already holds is kept exactly as saved (never downloaded again,
// never replaced), and only the rest go to `download`. Once Slack deletes a
// file or starts hiding it behind the workspace's plan, re-fetching its
// message gets a placeholder with no URL instead (old thread replies still
// come back, with one per file), and saving that over the stored entry is
// what unlinked 15 photos and videos in a September 2026 re-sync. Saved
// files Slack no longer lists at all are kept too: the archive keeps files
// people later delete in Slack.
export async function archiveMessageFiles(
  saved: ArchivedFile[],
  incoming: SlackFile[],
  download: (file: SlackFile) => Promise<ArchivedFile>,
): Promise<ArchivedFile[]> {
  const savedById = new Map(saved.filter((f) => f.storage_path).map((f) => [f.id, f]));
  const files = await Promise.all(incoming.map((f) => savedById.get(f.id) ?? download(f)));
  const listed = new Set(incoming.map((f) => f.id));
  return [...files, ...[...savedById.values()].filter((f) => !listed.has(f.id))];
}

// Batched — one Storage API round trip per SIGN_BATCH_SIZE paths rather than
// one call per file, and chunked so a page signing thousands of paths (the
// photo album signs a preview for every photo in the archive) sends several
// modest requests in parallel instead of one enormous one. A path whose
// object doesn't exist comes back without a signed URL and is simply absent
// from the result — the album relies on that to tell which previews exist.
const SIGN_BATCH_SIZE = 1000;

export async function signArchiveFileUrls(
  admin: SupabaseClient,
  storagePaths: string[],
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (storagePaths.length === 0) return result;

  const batches: string[][] = [];
  for (let i = 0; i < storagePaths.length; i += SIGN_BATCH_SIZE) {
    batches.push(storagePaths.slice(i, i + SIGN_BATCH_SIZE));
  }
  const responses = await Promise.all(
    batches.map((batch) => admin.storage.from(ARCHIVE_FILES_BUCKET).createSignedUrls(batch, ttlSeconds)),
  );
  for (const { data, error } of responses) {
    if (error || !data) {
      console.error("[slack-archive] signing file URLs failed:", error?.message);
      continue;
    }
    for (const entry of data) {
      if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
    }
  }
  return result;
}

// One original, signed on demand — what the album's media route redirects
// to. `download` names the file and makes the browser save it rather than
// display it. Null when the object doesn't exist (or signing failed).
export async function signArchiveFileUrl(
  admin: SupabaseClient,
  storagePath: string,
  opts: { download?: string } = {},
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(ARCHIVE_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, opts.download ? { download: opts.download } : undefined);
  if (error || !data?.signedUrl) {
    if (error) console.error("[slack-archive] signing file URL failed:", error.message);
    return null;
  }
  return data.signedUrl;
}
