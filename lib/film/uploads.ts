// Rows in public.game_film_uploads. Parent uploads write through the admin
// client (no portal login). The inbox reads through the same client after a
// permission check, so a missing RLS helper can't hide the list from someone
// who was granted Game film.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import { GAME_FILM_BUCKET, MOVED_RETENTION_DAYS, type FilmStatus, type FilmUpload, type YoutubeStatus } from "./types.ts";
import { storageObjectName } from "./validation.ts";

export const FILM_UPLOAD_COLUMNS =
  "id, team, team_id, uploader_name, filename, content_type, size_bytes, storage_path, status, created_at, moved_at, game_date, opponent, our_score, their_score, youtube_status, youtube_video_id, youtube_error, youtube_updated_at";

export function filmStoragePath(team: string, uploadId: string, filename: string): string {
  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${team}/${y}/${m}/${uploadId}/${storageObjectName(filename)}`;
}

export function newUploadId(): string {
  return randomUUID();
}

export async function insertHoldingUpload(input: {
  id: string;
  team: string;
  teamId: string;
  uploaderName: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  gameDate: string;
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
}): Promise<FilmUpload> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .insert({
      id: input.id,
      team: input.team,
      team_id: input.teamId,
      uploader_name: input.uploaderName,
      filename: input.filename,
      content_type: input.contentType,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      status: "holding",
      game_date: input.gameDate,
      opponent: input.opponent,
      our_score: input.ourScore,
      their_score: input.theirScore,
    })
    .select(FILM_UPLOAD_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't log the upload.");
  return data as FilmUpload;
}

export async function listFilmUploads(teamIds?: string[]): Promise<FilmUpload[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .order("game_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (teamIds) {
    if (teamIds.length === 0) return [];
    query = query.in("team_id", teamIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export async function getFilmUpload(id: string): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function updateFilmUploadGame(
  id: string,
  fields: {
    gameDate: string;
    opponent: string | null;
    ourScore: number | null;
    theirScore: number | null;
  }
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .update({
      game_date: fields.gameDate,
      opponent: fields.opponent,
      our_score: fields.ourScore,
      their_score: fields.theirScore,
    })
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function setFilmStatus(id: string, status: FilmStatus): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const patch =
    status === "moved"
      ? { status, moved_at: new Date().toISOString() }
      : { status, moved_at: null };
  const { data, error } = await admin
    .from("game_film_uploads")
    .update(patch)
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function deleteFilmUploadRow(id: string): Promise<FilmUpload | null> {
  const row = await getFilmUpload(id);
  if (!row) return null;
  const admin = createAdminClient();
  const { error } = await admin.from("game_film_uploads").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return row;
}

export async function listExpiredMovedUploads(now = new Date()): Promise<FilmUpload[]> {
  const cutoff = new Date(now.getTime() - MOVED_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .eq("status", "moved")
    .not("moved_at", "is", null)
    .lt("moved_at", cutoff);
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export async function setFilmYoutubeStatus(
  id: string,
  patch: {
    youtube_status: YoutubeStatus | null;
    youtube_video_id?: string | null;
    youtube_error?: string | null;
  }
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    youtube_status: patch.youtube_status,
    youtube_updated_at: new Date().toISOString(),
  };
  if (patch.youtube_video_id !== undefined) update.youtube_video_id = patch.youtube_video_id;
  if (patch.youtube_error !== undefined) update.youtube_error = patch.youtube_error;
  const { data, error } = await admin
    .from("game_film_uploads")
    .update(update)
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export type YoutubeJob = {
  upload_id: string;
  upload_uri: string | null;
  bytes_sent: number;
  attempts: number;
  updated_at: string;
};

export async function upsertYoutubeJob(
  uploadId: string,
  patch: Partial<Pick<YoutubeJob, "upload_uri" | "bytes_sent" | "attempts">>
): Promise<YoutubeJob> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("game_film_youtube_jobs")
    .select("upload_id, upload_uri, bytes_sent, attempts, updated_at")
    .eq("upload_id", uploadId)
    .maybeSingle();
  const next = {
    upload_id: uploadId,
    upload_uri: patch.upload_uri !== undefined ? patch.upload_uri : (existing?.upload_uri ?? null),
    bytes_sent: patch.bytes_sent !== undefined ? patch.bytes_sent : (existing?.bytes_sent ?? 0),
    attempts: patch.attempts !== undefined ? patch.attempts : (existing?.attempts ?? 0),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .upsert(next, { onConflict: "upload_id" })
    .select("upload_id, upload_uri, bytes_sent, attempts, updated_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube job.");
  return data as YoutubeJob;
}

export async function getYoutubeJob(uploadId: string): Promise<YoutubeJob | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .select("upload_id, upload_uri, bytes_sent, attempts, updated_at")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as YoutubeJob | null) ?? null;
}

export async function claimYoutubeWork(id: string, now = new Date()): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const stamp = now.toISOString();
  const staleBefore = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
  const { data: queued } = await admin
    .from("game_film_uploads")
    .update({ youtube_status: "uploading", youtube_error: null, youtube_updated_at: stamp })
    .eq("id", id)
    .eq("youtube_status", "queued")
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (queued) return queued as FilmUpload;
  const { data: stale, error } = await admin
    .from("game_film_uploads")
    .update({ youtube_status: "uploading", youtube_updated_at: stamp })
    .eq("id", id)
    .eq("youtube_status", "uploading")
    .lt("youtube_updated_at", staleBefore)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (stale) return stale as FilmUpload;
  const { data: untouched } = await admin
    .from("game_film_uploads")
    .update({ youtube_status: "uploading", youtube_updated_at: stamp })
    .eq("id", id)
    .eq("youtube_status", "uploading")
    .is("youtube_updated_at", null)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  return (untouched as FilmUpload | null) ?? null;
}

export async function listYoutubeWork(uploadId?: string): Promise<FilmUpload[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .in("youtube_status", ["queued", "uploading"])
    .order("created_at", { ascending: true })
    .limit(20);
  if (uploadId) query = query.eq("id", uploadId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export { GAME_FILM_BUCKET };
