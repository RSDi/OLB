// Read a film object the same way the YouTube worker does: mint a signed
// URL, then Range-GET the first byte. list()+search can miss a just-finished
// TUS object; createSignedUrl is what actually throws "Object not found".

import { filmStorage } from "./storage.ts";
import { STORAGE_GRACE_MS } from "./youtube-progress.ts";
import type { FilmUpload } from "./types.ts";

export class FilmStorageError extends Error {
  readonly code: "missing" | "not_ready" | "incomplete";
  constructor(message: string, code: "missing" | "not_ready" | "incomplete") {
    super(message);
    this.name = "FilmStorageError";
    this.code = code;
  }
}

export type FilmObjectInfo = {
  exists: boolean;
  size: number | null;
  error: string | null;
};

function contentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = /\/(\d+)\s*$/.exec(header);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function inspectFilmObject(
  path: string,
  expectedBytes?: number | null
): Promise<FilmObjectInfo> {
  let signed: string;
  try {
    signed = await filmStorage().signedDownloadUrl(path, 120);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Object not found";
    return { exists: false, size: null, error: message };
  }

  try {
    const res = await fetch(signed, { headers: { Range: "bytes=0-0" } });
    if (res.status === 404) return { exists: false, size: null, error: "Object not found" };
    if (!res.ok && res.status !== 206) {
      return { exists: false, size: null, error: `Couldn't read film bytes (${res.status}).` };
    }
    const fromRange = contentRangeTotal(res.headers.get("content-range"));
    const fromLength = Number(res.headers.get("content-length") ?? 0);
    const size = fromRange ?? (Number.isFinite(fromLength) && fromLength > 0 ? fromLength : null);
    if (expectedBytes && expectedBytes > 0 && size != null && size < expectedBytes * 0.95) {
      return {
        exists: false,
        size,
        error: `Storage object is incomplete (${size} of ${expectedBytes} bytes).`,
      };
    }
    return { exists: true, size, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Object not found";
    return { exists: false, size: null, error: message };
  }
}

export async function waitForFilmObject(
  path: string,
  opts?: { expectedBytes?: number | null; tries?: number; delayMs?: number }
): Promise<FilmObjectInfo> {
  const tries = opts?.tries ?? 8;
  const delayMs = opts?.delayMs ?? 750;
  let last: FilmObjectInfo = { exists: false, size: null, error: "Object not found" };
  for (let i = 0; i < tries; i++) {
    last = await inspectFilmObject(path, opts?.expectedBytes);
    if (last.exists) return last;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

export async function requireFilmObject(row: FilmUpload, now = Date.now()): Promise<number> {
  const info = await inspectFilmObject(row.storage_path, row.size_bytes);
  if (info.exists) {
    if (info.size && info.size > 0) return info.size;
    if (row.size_bytes && row.size_bytes > 0) return row.size_bytes;
    throw new FilmStorageError("Couldn't tell how large that video is.", "missing");
  }
  const age = now - new Date(row.created_at).getTime();
  const message = info.error || "Object not found";
  if (Number.isFinite(age) && age < STORAGE_GRACE_MS) {
    throw new FilmStorageError(message, "not_ready");
  }
  throw new FilmStorageError(message, info.size ? "incomplete" : "missing");
}
