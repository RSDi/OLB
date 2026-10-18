// Checks the parent-upload form before the server mints a TUS token.
// iPhone camera-roll videos are often .mov / HEVC with video/quicktime or an
// empty MIME; we accept those by extension when the browser doesn't send a type.

import { churchToday } from "../dates/today.ts";
import { parseFilmGameFields, type FilmGameFields } from "./game-meta.ts";
import { MAX_UPLOAD_BYTES } from "./types.ts";

export const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/3gpp",
  "video/3gpp2",
  "video/x-msvideo",
  "video/x-matroska",
  "video/hevc",
  "video/h265",
  "video/h264",
  "video/mp2t",
  "application/mxf",
]);

export const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".avi",
  ".mkv",
  ".hevc",
  ".3gp",
  ".mts",
  ".m2ts",
]);

const NAME_MAX = 80;
const FILENAME_MAX = 200;

export type UploadValidation =
  | { ok: true; uploaderName: string; filename: string; contentType: string; sizeBytes: number } & FilmGameFields
  | { ok: false; error: string };

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i).toLowerCase();
}

export function isVideoFile(filename: string, mime: string | null | undefined): boolean {
  const type = (mime ?? "").trim().toLowerCase();
  if (type && VIDEO_MIME_TYPES.has(type)) return true;
  if (type.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(extOf(filename));
}

export function cleanUploaderName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name || name.length > NAME_MAX) return null;
  return name;
}

export function cleanFilename(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/[/\\]/g, "_");
  if (!name || name.length > FILENAME_MAX) return null;
  return name;
}

export function cleanSizeBytes(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_UPLOAD_BYTES) return null;
  return Math.floor(n);
}

export function validateUploadInput(
  input: {
    uploaderName?: unknown;
    filename?: unknown;
    contentType?: unknown;
    sizeBytes?: unknown;
    gameDate?: unknown;
    opponent?: unknown;
    ourScore?: unknown;
    theirScore?: unknown;
  },
  today = churchToday()
): UploadValidation {
  const uploaderName = cleanUploaderName(input.uploaderName);
  if (!uploaderName) return { ok: false, error: "Your name is required." };
  const filename = cleanFilename(input.filename);
  if (!filename) return { ok: false, error: "That file name isn't usable." };
  const size = cleanSizeBytes(input.sizeBytes);
  if (size === null) {
    return { ok: false, error: "Each video has to be a file up to 20 GB." };
  }
  const contentType =
    typeof input.contentType === "string" ? input.contentType.trim().toLowerCase() : "";
  if (!isVideoFile(filename, contentType)) {
    return { ok: false, error: "Upload a video (phone recordings like .mov are fine)." };
  }
  const game = parseFilmGameFields(input, today);
  if (!game.ok) return game;
  return {
    ok: true,
    uploaderName,
    filename,
    contentType: contentType || "video/mp4",
    sizeBytes: size,
    gameDate: game.gameDate,
    opponent: game.opponent,
    ourScore: game.ourScore,
    theirScore: game.theirScore,
  };
}

export function storageObjectName(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(0, FILENAME_MAX) || "video.mp4";
}
