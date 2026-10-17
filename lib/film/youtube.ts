// Hook for a later "publish to YouTube" step. Mark-moved is the current
// hand-off; this is intentionally a no-op so storage and the inbox can land
// without a YouTube app. Call publishFilmToYouTube from a future button.

import type { FilmUpload } from "./types.ts";

export async function publishFilmToYouTube(
  upload: Pick<FilmUpload, "id" | "filename" | "storage_path" | "team">
): Promise<{ ok: false; reason: string }> {
  void upload;
  return { ok: false, reason: "Publishing to YouTube is not set up yet." };
}
