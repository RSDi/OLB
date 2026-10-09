import { createClient } from "../supabase/client";
import { heicToJpeg, looksLikeHeic } from "../scan/heic";
import { NOTE_FILE_EXT, NOTE_FILE_MAX_BYTES, PLAYER_NOTE_FILES_BUCKET, type NoteAttachment } from "./player-notes";

// Client-side uploader for attachments on player notes (0124). The bucket is
// private; its storage policies limit it to the board and the Registrations
// grant.

export function fileType(file: File): string {
  return file.type || (looksLikeHeic(file) ? "image/heic" : "");
}

// Uploads one file for a note that isn't saved yet, under <note id>/ so the
// server can check it belongs to the note it's saved on.
export async function uploadNoteFile(noteId: string, picked: File): Promise<{ file?: NoteAttachment; error?: string }> {
  let file = picked;
  // iPhone photos as JPEGs, so every browser can show them.
  if (looksLikeHeic(file)) {
    try {
      const jpeg = await heicToJpeg(file);
      file = new File([jpeg], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg" });
    } catch {
      // Kept as HEIC: it still opens as a file.
    }
  }
  const type = fileType(file);
  const ext = NOTE_FILE_EXT[type.toLowerCase()];
  if (!ext) return { error: `${file.name || "That file"} isn't a picture or a PDF.` };
  if (file.size > NOTE_FILE_MAX_BYTES) return { error: `${file.name || "That file"} is over 10 MB.` };
  const path = `${noteId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient()
    .storage.from(PLAYER_NOTE_FILES_BUCKET)
    .upload(path, file, { upsert: false, contentType: type });
  if (error) return { error: error.message };
  // A pasted screenshot comes in as "image.png"; give it a date instead.
  const name = file.name && file.name !== "image.png" ? file.name : `Screenshot ${new Date().toLocaleString()}.${ext}`;
  return { file: { path, name, type, size: file.size } };
}
