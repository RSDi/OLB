import { createClient } from "../supabase/client";
import { REQUIREMENT_FILES_BUCKET } from "./types";

// Client-side uploader for scans of what a player handed in (a photo of the
// signed handbook page, say). The bucket is private and its storage policies
// (migration 0098) limit it to the board. Files live under
// <player>/<requirement>/ so the server actions can check a path belongs to
// the record it's saved on.

export const REQUIREMENT_FILE_ACCEPT = "image/*,application/pdf";
export const REQUIREMENT_FILE_MAX_BYTES = 10 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
};

function extFromFile(file: File): string {
  const fromName = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return MIME_EXT[file.type.toLowerCase()] ?? "bin";
}

export async function uploadRequirementFile(
  playerId: string,
  requirementId: string,
  file: File
): Promise<{ path?: string; error?: string }> {
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return { error: "Upload a photo or a PDF." };
  }
  if (file.size > REQUIREMENT_FILE_MAX_BYTES) return { error: "That file is over 10 MB." };

  const path = `${playerId}/${requirementId}/${crypto.randomUUID()}.${extFromFile(file)}`;
  const { error } = await createClient()
    .storage.from(REQUIREMENT_FILES_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) return { error: error.message };
  return { path };
}
