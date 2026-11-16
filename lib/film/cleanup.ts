// Game-film storage cleanup. Called from the Vercel cron at
// /api/cron/film-cleanup.
// - Originals YouTube has reported Ready for 30 days: delete the file, keep
//   the row (the inbox still lists the game and its YouTube link).
// - Legacy rows a coach marked moved: delete file and row 30 days later.

import {
  deleteFilmUploadRow,
  listExpiredMovedUploads,
  listExpiredYoutubeOriginals,
  markFilmOriginalDeleted,
} from "./uploads.ts";
import { filmStorage } from "./storage.ts";
import { purgeExpiredDiscardedFilmSlackDrafts } from "./slack-drafts.ts";

export async function cleanupMovedFilm(): Promise<{
  scanned: number;
  deleted: number;
  originalsDeleted: number;
  discardedPurged: number;
  errors: { id: string; error: string }[];
}> {
  const discardedPurged = await purgeExpiredDiscardedFilmSlackDrafts().catch(() => 0);
  const rows = await listExpiredMovedUploads();
  const storage = filmStorage();
  const errors: { id: string; error: string }[] = [];
  let deleted = 0;
  for (const row of rows) {
    try {
      await storage.deleteObject(row.storage_path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "storage delete failed";
      // Missing object is still a row we should drop.
      if (!/not found|404|No such file/i.test(message)) {
        errors.push({ id: row.id, error: message });
        continue;
      }
    }
    try {
      await deleteFilmUploadRow(row.id);
      deleted += 1;
    } catch (err) {
      errors.push({ id: row.id, error: err instanceof Error ? err.message : "row delete failed" });
    }
  }
  let originalsDeleted = 0;
  const originals = await listExpiredYoutubeOriginals();
  for (const row of originals) {
    try {
      await storage.deleteObject(row.storage_path);
    } catch (err) {
      const message = err instanceof Error ? err.message : "storage delete failed";
      if (!/not found|404|No such file/i.test(message)) {
        errors.push({ id: row.id, error: message });
        continue;
      }
    }
    try {
      await markFilmOriginalDeleted(row.id);
      originalsDeleted += 1;
    } catch (err) {
      errors.push({ id: row.id, error: err instanceof Error ? err.message : "row update failed" });
    }
  }
  return { scanned: rows.length + originals.length, deleted, originalsDeleted, discardedPurged, errors };
}
