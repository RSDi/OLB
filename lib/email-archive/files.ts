import type { SupabaseClient } from "@supabase/supabase-js";

export const EMAIL_ARCHIVE_FILES_BUCKET = "email-archive-files";
const SIGNED_URL_TTL_SECONDS = 3600;

export function sanitizeStorageFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 150) || "file";
}

export function emailAttachmentStoragePath(threadId: string, messageId: string, filename: string): string {
  return `${threadId}/${messageId}/${sanitizeStorageFileName(filename)}`;
}

export async function uploadEmailAttachment(
  admin: SupabaseClient,
  path: string,
  bytes: Buffer,
  mime: string,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await admin.storage.from(EMAIL_ARCHIVE_FILES_BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: true,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signEmailFileUrl(
  admin: SupabaseClient,
  storagePath: string,
  opts: { download?: string } = {},
): Promise<string | null> {
  const options = opts.download ? { download: opts.download } : undefined;
  const { data, error } = await admin.storage
    .from(EMAIL_ARCHIVE_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, options);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
