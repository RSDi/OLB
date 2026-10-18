// Rows in public.game_film_uploads. Parent uploads write through the admin
// client (no portal login). The inbox reads through the same client after a
// permission check, so a missing RLS helper can't hide the list from someone
// who was granted Game film.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import {
  GAME_FILM_BUCKET,
  MOVED_RETENTION_DAYS,
  type FilmStatus,
  type FilmUpload,
  type YoutubePlaylistStatus,
  type YoutubeEvent,
  type YoutubeEventKind,
  type YoutubeJob,
  type YoutubePrivacy,
  type YoutubeProcessing,
  type YoutubeStatus,
} from "./types.ts";
import { storageObjectName } from "./validation.ts";

export const FILM_UPLOAD_COLUMNS =
  "id, team, team_id, uploader_name, filename, content_type, size_bytes, storage_path, status, created_at, moved_at, game_date, opponent, our_score, their_score, youtube_status, youtube_video_id, youtube_error, youtube_updated_at, youtube_playlist_id, youtube_playlist_status, youtube_playlist_error, youtube_playlist_item_id, youtube_playlist_updated_at, youtube_privacy, youtube_processing, youtube_synced_at";

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

export async function updateFilmUploadPlaylist(
  id: string,
  playlistId: string | null
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .update({
      youtube_playlist_id: playlistId,
      youtube_playlist_updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function setFilmPlaylistStatus(
  id: string,
  patch: {
    youtube_playlist_status: YoutubePlaylistStatus | null;
    youtube_playlist_error?: string | null;
    youtube_playlist_item_id?: string | null;
  }
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    youtube_playlist_status: patch.youtube_playlist_status,
    youtube_playlist_updated_at: new Date().toISOString(),
  };
  if (patch.youtube_playlist_error !== undefined) update.youtube_playlist_error = patch.youtube_playlist_error;
  if (patch.youtube_playlist_item_id !== undefined) update.youtube_playlist_item_id = patch.youtube_playlist_item_id;
  const { data, error } = await admin
    .from("game_film_uploads")
    .update(update)
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
}

export async function listPlaylistWork(uploadId?: string): Promise<FilmUpload[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .eq("youtube_status", "done")
    .eq("youtube_playlist_status", "queued")
    .not("youtube_video_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(20);
  if (uploadId) query = query.eq("id", uploadId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export async function teamYoutubePlaylistId(teamId: string | null, slug: string): Promise<string | null> {
  const admin = createAdminClient();
  if (teamId) {
    const { data, error } = await admin.from("olb_teams").select("youtube_playlist_id").eq("id", teamId).maybeSingle();
    if (error) throw new Error(error.message);
    const id = (data as { youtube_playlist_id: string | null } | null)?.youtube_playlist_id?.trim();
    if (id) return id;
  }
  if (slug) {
    const { data, error } = await admin.from("olb_teams").select("youtube_playlist_id").eq("film_slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { youtube_playlist_id: string | null } | null)?.youtube_playlist_id?.trim() || null;
  }
  return null;
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

export async function listFilmYoutubeVideos(opts?: {
  teamIds?: string[];
  videoIds?: string[];
}): Promise<FilmUpload[]> {
  const admin = createAdminClient();
  let query = admin
    .from("game_film_uploads")
    .select(FILM_UPLOAD_COLUMNS)
    .not("youtube_video_id", "is", null)
    .order("created_at", { ascending: true });
  if (opts?.teamIds) {
    if (opts.teamIds.length === 0) return [];
    query = query.in("team_id", opts.teamIds);
  }
  if (opts?.videoIds && opts.videoIds.length > 0) {
    query = query.in("youtube_video_id", opts.videoIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as FilmUpload[]) ?? [];
}

export async function setFilmYoutubeLiveStatus(
  id: string,
  patch: {
    youtube_privacy: YoutubePrivacy | null;
    youtube_processing: YoutubeProcessing | null;
  }
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_uploads")
    .update({
      youtube_privacy: patch.youtube_privacy,
      youtube_processing: patch.youtube_processing,
      youtube_synced_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FilmUpload | null) ?? null;
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

const YOUTUBE_JOB_COLUMNS =
  "upload_id, upload_uri, bytes_sent, bytes_total, attempts, started_at, last_progress_at, updated_at";
const YOUTUBE_EVENT_COLUMNS = "id, upload_id, at, kind, message, detail, bytes_sent, bytes_total";

export type { YoutubeEvent, YoutubeJob };

export async function upsertYoutubeJob(
  uploadId: string,
  patch: Partial<Pick<YoutubeJob, "upload_uri" | "bytes_sent" | "bytes_total" | "attempts" | "started_at" | "last_progress_at">>
): Promise<YoutubeJob> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("game_film_youtube_jobs")
    .select(YOUTUBE_JOB_COLUMNS)
    .eq("upload_id", uploadId)
    .maybeSingle();
  const now = new Date().toISOString();
  const bytesSent = patch.bytes_sent !== undefined ? patch.bytes_sent : (existing?.bytes_sent ?? 0);
  const progressMoved =
    patch.bytes_sent !== undefined && Number(patch.bytes_sent) !== Number(existing?.bytes_sent ?? 0);
  const next = {
    upload_id: uploadId,
    upload_uri: patch.upload_uri !== undefined ? patch.upload_uri : (existing?.upload_uri ?? null),
    bytes_sent: bytesSent,
    bytes_total: patch.bytes_total !== undefined ? patch.bytes_total : (existing?.bytes_total ?? null),
    attempts: patch.attempts !== undefined ? patch.attempts : (existing?.attempts ?? 0),
    started_at:
      patch.started_at !== undefined ? patch.started_at : (existing?.started_at ?? null),
    last_progress_at:
      patch.last_progress_at !== undefined
        ? patch.last_progress_at
        : progressMoved
          ? now
          : (existing?.last_progress_at ?? null),
    updated_at: now,
  };
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .upsert(next, { onConflict: "upload_id" })
    .select(YOUTUBE_JOB_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube job.");
  return data as YoutubeJob;
}

export async function getYoutubeJob(uploadId: string): Promise<YoutubeJob | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .select(YOUTUBE_JOB_COLUMNS)
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as YoutubeJob | null) ?? null;
}

export async function listYoutubeJobs(uploadIds: string[]): Promise<YoutubeJob[]> {
  if (uploadIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .select(YOUTUBE_JOB_COLUMNS)
    .in("upload_id", uploadIds);
  if (error) throw new Error(error.message);
  return (data as YoutubeJob[]) ?? [];
}

export async function appendYoutubeEvent(input: {
  uploadId: string;
  kind: YoutubeEventKind;
  message: string;
  detail?: string | null;
  bytesSent?: number | null;
  bytesTotal?: number | null;
  at?: Date;
}): Promise<YoutubeEvent> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_events")
    .insert({
      upload_id: input.uploadId,
      kind: input.kind,
      message: input.message,
      detail: input.detail ?? null,
      bytes_sent: input.bytesSent ?? null,
      bytes_total: input.bytesTotal ?? null,
      at: (input.at ?? new Date()).toISOString(),
    })
    .select(YOUTUBE_EVENT_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube event.");
  return data as YoutubeEvent;
}

export async function listYoutubeEvents(uploadIds: string[]): Promise<YoutubeEvent[]> {
  if (uploadIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_events")
    .select(YOUTUBE_EVENT_COLUMNS)
    .in("upload_id", uploadIds)
    .order("at", { ascending: false })
    .limit(Math.min(2000, Math.max(40, uploadIds.length * 40)));
  if (error) throw new Error(error.message);
  return ((data as YoutubeEvent[]) ?? []).slice().reverse();
}

export async function loadFilmYoutubeExtras(uploadIds: string[]): Promise<{
  jobs: Record<string, YoutubeJob>;
  events: Record<string, YoutubeEvent[]>;
}> {
  const [jobRows, eventRows] = await Promise.all([listYoutubeJobs(uploadIds), listYoutubeEvents(uploadIds)]);
  const jobs: Record<string, YoutubeJob> = {};
  for (const job of jobRows) jobs[job.upload_id] = job;
  const events: Record<string, YoutubeEvent[]> = {};
  for (const ev of eventRows) {
    (events[ev.upload_id] ??= []).push(ev);
  }
  return { jobs, events };
}

export async function latestYoutubeEventKind(uploadId: string): Promise<YoutubeEventKind | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_events")
    .select("kind")
    .eq("upload_id", uploadId)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as { kind?: YoutubeEventKind } | null)?.kind ?? null);
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
