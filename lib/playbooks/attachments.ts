import { createClient } from "../supabase/client";

// Client-side uploader for the `playbook-attachments` bucket. The Supabase
// storage RLS policy (migration 0031) gates writes to staff. Files are keyed
// flat by <uuid>.<ext> — no per-playbook folder for v1.

const BUCKET = "playbook-attachments";

export interface UploadResult {
  url?: string;
  path?: string;
  error?: string;
}

function extFromFile(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (fromName) return fromName;
  // Fall back to MIME map if the filename has no extension (camera roll etc).
  const mime = file.type.toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "bin";
}

export async function uploadAttachment(file: File): Promise<UploadResult> {
  const supabase = createClient();
  const ext = extFromFile(file);
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (uploadErr) return { error: uploadErr.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return { error: "Upload succeeded but no public URL was returned." };

  return { url: data.publicUrl, path };
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}
