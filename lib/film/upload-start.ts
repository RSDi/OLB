// Shared steps behind both upload doors: the family page (/film/upload-token,
// unlocked by the team code) and the staff uploader (/api/film/staff-upload,
// signed-in portal user who picks any team). Callers do their own access
// check first; these only validate, log the holding row, and mint the TUS
// upload, or kick YouTube once the bytes have landed.

import { validateUploadInput } from "./validation.ts";
import { filmStorage } from "./storage.ts";
import { appendYoutubeEvent, filmStoragePath, insertHoldingUpload, newUploadId, saveFilmUploadStats } from "./uploads.ts";
import { uploadStatsRow, type UploadStatsInput } from "./upload-stats.ts";
import { waitForFilmObject } from "./object.ts";
import { enqueueYoutubeIfConnected, processYoutubeQueue, YOUTUBE_KICK_BUDGET_MS } from "./youtube.ts";
import { GAME_FILM_BUCKET, type FilmUpload } from "./types.ts";
import { formatFilmGameLine } from "./game-meta.ts";
import { resumeRefusal } from "./resume.ts";

export type StartedFilmUpload = {
  uploadId: string;
  bucket: string;
  path: string;
  endpoint: string;
  token: string;
  uploadUrl: string;
  contentType: string;
};

export async function startFilmUpload(
  team: { slug: string; id: string },
  body: Record<string, unknown>
): Promise<{ ok: true; data: StartedFilmUpload } | { ok: false; status: number; error: string }> {
  const checked = validateUploadInput({
    uploaderName: body.uploaderName,
    filename: body.filename,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    gameDate: body.gameDate,
    opponent: body.opponent,
    ourScore: body.ourScore,
    theirScore: body.theirScore,
  });
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };

  const id = newUploadId();
  const path = filmStoragePath(team.slug, id, checked.filename);
  let minted;
  try {
    minted = await filmStorage().mintUpload({
      path,
      contentType: checked.contentType,
      sizeBytes: checked.sizeBytes,
    });
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Couldn't start the upload." };
  }

  try {
    await insertHoldingUpload({
      id,
      team: team.slug,
      teamId: team.id,
      uploaderName: checked.uploaderName,
      filename: checked.filename,
      contentType: checked.contentType,
      sizeBytes: checked.sizeBytes,
      storagePath: minted.path,
      gameDate: checked.gameDate,
      opponent: checked.opponent,
      ourScore: checked.ourScore,
      theirScore: checked.theirScore,
    });
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Couldn't log the upload." };
  }

  if (!minted.uploadUrl) return { ok: false, status: 500, error: "Couldn't start the resumable upload." };

  return {
    ok: true,
    data: {
      uploadId: id,
      bucket: minted.bucket || GAME_FILM_BUCKET,
      path: minted.path,
      endpoint: minted.endpoint,
      token: minted.token,
      uploadUrl: minted.uploadUrl,
      contentType: checked.contentType,
    },
  };
}

// Run inside after(): the browser has finished TUS for this row.
// stats: what the browser measured (upload time, speed, resolution).
export async function kickFilmUploadComplete(row: FilmUpload, stats?: UploadStatsInput): Promise<void> {
  await saveFilmUploadStats(row.id, uploadStatsRow(stats));
  try {
    const info = await waitForFilmObject(row.storage_path, { expectedBytes: row.size_bytes });
    if (info.exists) {
      await appendYoutubeEvent({
        uploadId: row.id,
        kind: "received",
        message: "File received",
        bytesSent: info.size,
        bytesTotal: row.size_bytes ?? info.size,
      });
    }
    // Don't fail here if Storage hasn't published the TUS object yet.
    // The worker treats a missing object as not-ready for 15 minutes, then
    // fails with the mapped "isn't in storage" error. A 6-second give-up
    // was how 4–5 GB clips got "Object not found" while the file was still
    // landing.
    const { queued } = await enqueueYoutubeIfConnected(row.id);
    if (queued) await processYoutubeQueue({ budgetMs: YOUTUBE_KICK_BUDGET_MS, uploadId: row.id });
  } catch (err) {
    console.error("film-complete youtube kick:", err instanceof Error ? err.message : err);
  }
}

// Re-sign a token for an upload this browser already started, so it can ask
// Storage how far it got and send only the rest. teamSlug: the team the
// caller may resume for (the family session's team, or the row's own team
// for the staff uploader).
export async function resumeFilmUpload(
  row: FilmUpload | null,
  teamSlug: string
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string }> {
  const refusal = resumeRefusal(row, teamSlug);
  if (refusal || !row) return { ok: false, status: 409, error: refusal ?? "That upload can't be picked back up." };
  let signed;
  try {
    signed = await filmStorage().resignUpload(row.storage_path);
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Couldn't pick the upload back up." };
  }
  return {
    ok: true,
    data: {
      uploadId: row.id,
      bucket: signed.bucket,
      path: row.storage_path,
      endpoint: signed.endpoint,
      token: signed.token,
      contentType: row.content_type,
      gameLine: formatFilmGameLine({
        gameDate: row.game_date,
        opponent: row.opponent,
        ourScore: row.our_score,
        theirScore: row.their_score,
      }),
    },
  };
}
