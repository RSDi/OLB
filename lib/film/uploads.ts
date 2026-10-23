// Rows in public.game_film_uploads. Parent uploads write through the admin
// client (no portal login). The inbox reads through the same client after a
// permission check, so a missing RLS helper can't hide the list from someone
// who was granted Game film.

import { randomUUID } from "node:crypto";
import { createAdminClient } from "../supabase/admin";
import {
  YOUTUBE_EXTRAS_RECHECK_MS,
  YOUTUBE_STALE_MS,
  YOUTUBE_RETRY_LEASE_HELD,
  acquireYoutubeLeaseWithClient,
  insertYoutubeJobIfAbsentWithClient,
  isMissingYoutubeJobExtraColumn,
  patchYoutubeJobAndReleaseWithClient,
  updateYoutubeJobIfLeaseFree,
  type YoutubeLeaseClient,
} from "./youtube-resume.ts";
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

const YOUTUBE_JOB_BASE_COLUMNS =
  "upload_id, upload_uri, bytes_sent, bytes_total, attempts, started_at, last_progress_at, updated_at";
const YOUTUBE_JOB_EXTRA_COLUMNS = "next_attempt_at, claimed_until, claimed_by, transient_attempts";
const YOUTUBE_EVENT_COLUMNS = "id, upload_id, at, kind, message, detail, bytes_sent, bytes_total";

export type { YoutubeEvent, YoutubeJob };

export type YoutubeJobPatch = Partial<
  Pick<
    YoutubeJob,
    | "upload_uri"
    | "bytes_sent"
    | "bytes_total"
    | "attempts"
    | "started_at"
    | "last_progress_at"
    | "next_attempt_at"
    | "claimed_until"
    | "claimed_by"
    | "transient_attempts"
  >
>;

/** Cached 0159-column probe. false is rechecked so a warm instance picks up a later apply (L2). */
let youtubeJobExtras: boolean | null = null;
let youtubeJobExtrasCheckedAt = 0;

export { isMissingYoutubeJobExtraColumn };

function youtubeJobColumns(): string {
  return youtubeJobExtras === false
    ? YOUTUBE_JOB_BASE_COLUMNS
    : `${YOUTUBE_JOB_BASE_COLUMNS}, ${YOUTUBE_JOB_EXTRA_COLUMNS}`;
}

function disableYoutubeJobExtras(): void {
  youtubeJobExtras = false;
  youtubeJobExtrasCheckedAt = Date.now();
}

function youtubeJobExtrasOn(): boolean {
  return youtubeJobExtras !== false;
}

export function youtubeResumeColumnsKnown(): boolean | null {
  return youtubeJobExtras;
}

function stripYoutubeJobExtras<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  if (youtubeJobExtrasOn()) return row;
  const next = { ...row };
  delete next.next_attempt_at;
  delete next.claimed_until;
  delete next.claimed_by;
  delete next.transient_attempts;
  return next;
}

export async function upsertYoutubeJob(uploadId: string, patch: YoutubeJobPatch): Promise<YoutubeJob> {
  const admin = createAdminClient();
  const existing = await getYoutubeJob(uploadId);
  const now = new Date().toISOString();
  const bytesSent = patch.bytes_sent !== undefined ? patch.bytes_sent : (existing?.bytes_sent ?? 0);
  const progressMoved =
    patch.bytes_sent !== undefined && Number(patch.bytes_sent) !== Number(existing?.bytes_sent ?? 0);
  const next = stripYoutubeJobExtras({
    upload_id: uploadId,
    upload_uri: patch.upload_uri !== undefined ? patch.upload_uri : (existing?.upload_uri ?? null),
    bytes_sent: bytesSent,
    bytes_total: patch.bytes_total !== undefined ? patch.bytes_total : (existing?.bytes_total ?? null),
    attempts: patch.attempts !== undefined ? patch.attempts : (existing?.attempts ?? 0),
    started_at: patch.started_at !== undefined ? patch.started_at : (existing?.started_at ?? null),
    last_progress_at:
      patch.last_progress_at !== undefined
        ? patch.last_progress_at
        : progressMoved
          ? now
          : (existing?.last_progress_at ?? null),
    next_attempt_at:
      patch.next_attempt_at !== undefined ? patch.next_attempt_at : (existing?.next_attempt_at ?? null),
    claimed_until:
      patch.claimed_until !== undefined ? patch.claimed_until : (existing?.claimed_until ?? null),
    claimed_by: patch.claimed_by !== undefined ? patch.claimed_by : (existing?.claimed_by ?? null),
    transient_attempts:
      patch.transient_attempts !== undefined
        ? patch.transient_attempts
        : (existing?.transient_attempts ?? 0),
    updated_at: now,
  });
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .upsert(next, { onConflict: "upload_id" })
    .select(youtubeJobColumns())
    .single();
  if (error && youtubeJobExtrasOn() && isMissingYoutubeJobExtraColumn(error.message)) {
    disableYoutubeJobExtras();
    return upsertYoutubeJob(uploadId, patch);
  }
  if (error || !data) throw new Error(error?.message ?? "Couldn't save the YouTube job.");
  if (youtubeJobExtras !== false) {
    youtubeJobExtras = true;
    youtubeJobExtrasCheckedAt = Date.now();
  }
  return data as unknown as YoutubeJob;
}

export async function getYoutubeJob(uploadId: string): Promise<YoutubeJob | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .select(youtubeJobColumns())
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (error && youtubeJobExtrasOn() && isMissingYoutubeJobExtraColumn(error.message)) {
    disableYoutubeJobExtras();
    return getYoutubeJob(uploadId);
  }
  if (error) throw new Error(error.message);
  if (data && youtubeJobExtras !== false) {
    youtubeJobExtras = true;
    youtubeJobExtrasCheckedAt = Date.now();
  }
  return (data as unknown as YoutubeJob | null) ?? null;
}

export async function listYoutubeJobs(uploadIds: string[]): Promise<YoutubeJob[]> {
  if (uploadIds.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("game_film_youtube_jobs")
    .select(youtubeJobColumns())
    .in("upload_id", uploadIds);
  if (error && youtubeJobExtrasOn() && isMissingYoutubeJobExtraColumn(error.message)) {
    disableYoutubeJobExtras();
    return listYoutubeJobs(uploadIds);
  }
  if (error) throw new Error(error.message);
  if (data && youtubeJobExtras !== false) {
    youtubeJobExtras = true;
    youtubeJobExtrasCheckedAt = Date.now();
  }
  return (data as unknown as YoutubeJob[]) ?? [];
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

export async function probeYoutubeResumeColumns(): Promise<boolean> {
  if (youtubeJobExtras === true) return true;
  if (
    youtubeJobExtras === false &&
    Date.now() - youtubeJobExtrasCheckedAt < YOUTUBE_EXTRAS_RECHECK_MS
  ) {
    return false;
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_film_youtube_jobs")
    .select(YOUTUBE_JOB_EXTRA_COLUMNS)
    .limit(1);
  if (error && isMissingYoutubeJobExtraColumn(error.message)) {
    disableYoutubeJobExtras();
    return false;
  }
  if (error) throw new Error(error.message);
  youtubeJobExtras = true;
  youtubeJobExtrasCheckedAt = Date.now();
  return true;
}

async function tryAcquireYoutubeLease(
  id: string,
  now: Date,
  leaseUntil: string,
  owner: string
): Promise<boolean> {
  const extras = await probeYoutubeResumeColumns();
  if (!extras) return false;
  const result = await acquireYoutubeLeaseWithClient(
    createAdminClient() as unknown as YoutubeLeaseClient,
    id,
    now,
    leaseUntil,
    owner
  );
  if (result.ok) return true;
  if (result.error && isMissingYoutubeJobExtraColumn(result.error.message)) {
    disableYoutubeJobExtras();
    return false;
  }
  if (result.error && (result.error.code === "23505" || /duplicate key/i.test(result.error.message))) {
    return false;
  }
  if (result.error) throw new Error(result.error.message);
  return false;
}

async function revertYoutubeQueuedClaim(id: string, claimedAt: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_film_uploads")
    .update({ youtube_status: "queued", youtube_error: null, youtube_updated_at: claimedAt })
    .eq("id", id)
    .eq("youtube_status", "uploading")
    .eq("youtube_updated_at", claimedAt);
  if (error) throw new Error(error.message);
}

export async function applyYoutubeManualRetry(
  uploadId: string,
  patch: YoutubeJobPatch,
  now = new Date()
): Promise<YoutubeJob> {
  const extras = await probeYoutubeResumeColumns();
  if (extras) {
    const existing = await getYoutubeJob(uploadId);
    if (existing) {
      const admin = createAdminClient();
      const stamp = now.toISOString();
      const result = await updateYoutubeJobIfLeaseFree(
        admin as unknown as YoutubeLeaseClient,
        uploadId,
        {
          upload_uri: patch.upload_uri !== undefined ? patch.upload_uri : existing.upload_uri,
          bytes_sent: patch.bytes_sent !== undefined ? patch.bytes_sent : existing.bytes_sent,
          bytes_total: patch.bytes_total !== undefined ? patch.bytes_total : existing.bytes_total,
          attempts: patch.attempts !== undefined ? patch.attempts : existing.attempts,
          started_at: patch.started_at !== undefined ? patch.started_at : existing.started_at,
          last_progress_at:
            patch.last_progress_at !== undefined ? patch.last_progress_at : existing.last_progress_at,
          next_attempt_at: null,
          transient_attempts: 0,
          updated_at: stamp,
        },
        now
      );
      if (result.error && isMissingYoutubeJobExtraColumn(result.error.message)) {
        disableYoutubeJobExtras();
      } else {
        if (result.error) throw new Error(result.error.message);
        if (!result.ok) throw new Error(YOUTUBE_RETRY_LEASE_HELD);
        const job = (await getYoutubeJob(uploadId)) ?? existing;
        await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
        return job;
      }
    } else {
      const stamp = now.toISOString();
      const inserted = await insertYoutubeJobIfAbsentWithClient(
        createAdminClient() as unknown as YoutubeLeaseClient,
        {
          upload_id: uploadId,
          upload_uri: patch.upload_uri ?? null,
          bytes_sent: patch.bytes_sent ?? 0,
          bytes_total: patch.bytes_total ?? null,
          attempts: patch.attempts ?? 0,
          started_at: patch.started_at ?? null,
          last_progress_at: patch.last_progress_at ?? null,
          next_attempt_at: null,
          claimed_until: null,
          claimed_by: null,
          transient_attempts: 0,
          updated_at: stamp,
        }
      );
      if (inserted.error && isMissingYoutubeJobExtraColumn(inserted.error.message)) {
        disableYoutubeJobExtras();
      } else if (inserted.conflict) {
        const retry = await updateYoutubeJobIfLeaseFree(
          createAdminClient() as unknown as YoutubeLeaseClient,
          uploadId,
          {
            upload_uri: patch.upload_uri,
            bytes_sent: patch.bytes_sent,
            bytes_total: patch.bytes_total,
            attempts: patch.attempts,
            started_at: patch.started_at,
            last_progress_at: patch.last_progress_at,
            next_attempt_at: null,
            transient_attempts: 0,
          },
          now
        );
        if (retry.error && isMissingYoutubeJobExtraColumn(retry.error.message)) {
          disableYoutubeJobExtras();
        } else {
          if (retry.error) throw new Error(retry.error.message);
          if (!retry.ok) throw new Error(YOUTUBE_RETRY_LEASE_HELD);
        }
      } else if (inserted.error) {
        throw new Error(inserted.error.message);
      }
      if (youtubeJobExtrasOn()) {
        const job = await getYoutubeJob(uploadId);
        if (!job) throw new Error("Couldn't save the YouTube job.");
        await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
        return job;
      }
    }
  }
  const job = await upsertYoutubeJob(uploadId, patch);
  await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
  return job;
}

export async function patchYoutubeJobAndReleaseLease(
  id: string,
  owner: string,
  patch: YoutubeJobPatch,
  now = new Date()
): Promise<boolean> {
  const extras = await probeYoutubeResumeColumns();
  if (!extras) {
    await upsertYoutubeJob(id, patch);
    return true;
  }
  const existing = await getYoutubeJob(id);
  const result = await patchYoutubeJobAndReleaseWithClient(
    createAdminClient() as unknown as YoutubeLeaseClient,
    id,
    owner,
    {
      upload_uri: patch.upload_uri !== undefined ? patch.upload_uri : (existing?.upload_uri ?? null),
      bytes_sent: patch.bytes_sent !== undefined ? patch.bytes_sent : (existing?.bytes_sent ?? 0),
      bytes_total: patch.bytes_total !== undefined ? patch.bytes_total : (existing?.bytes_total ?? null),
      attempts: patch.attempts !== undefined ? patch.attempts : (existing?.attempts ?? 0),
      started_at: patch.started_at !== undefined ? patch.started_at : (existing?.started_at ?? null),
      last_progress_at:
        patch.last_progress_at !== undefined ? patch.last_progress_at : (existing?.last_progress_at ?? null),
      next_attempt_at: patch.next_attempt_at !== undefined ? patch.next_attempt_at : (existing?.next_attempt_at ?? null),
      transient_attempts:
        patch.transient_attempts !== undefined ? patch.transient_attempts : (existing?.transient_attempts ?? 0),
    },
    now
  );
  if (result.error && isMissingYoutubeJobExtraColumn(result.error.message)) {
    disableYoutubeJobExtras();
    await upsertYoutubeJob(id, patch);
    return true;
  }
  if (result.error) throw new Error(result.error.message);
  return result.ok;
}

export async function releaseYoutubeClaim(id: string, owner: string): Promise<void> {
  const extras = await probeYoutubeResumeColumns();
  if (!extras) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_film_youtube_jobs")
    .update({ claimed_until: null, claimed_by: null, updated_at: new Date().toISOString() })
    .eq("upload_id", id)
    .eq("claimed_by", owner);
  if (error && isMissingYoutubeJobExtraColumn(error.message)) {
    disableYoutubeJobExtras();
    return;
  }
  if (error) throw new Error(error.message);
}

export async function claimYoutubeWork(
  id: string,
  now = new Date(),
  leaseMs = 5 * 60 * 1000,
  owner = crypto.randomUUID()
): Promise<FilmUpload | null> {
  const admin = createAdminClient();
  const stamp = now.toISOString();
  const extras = await probeYoutubeResumeColumns();

  if (extras) {
    const job = await getYoutubeJob(id);
    if (job?.next_attempt_at && new Date(job.next_attempt_at).getTime() > now.getTime()) {
      return null;
    }
  }

  const { data: queued } = await admin
    .from("game_film_uploads")
    .update({ youtube_status: "uploading", youtube_error: null, youtube_updated_at: stamp })
    .eq("id", id)
    .eq("youtube_status", "queued")
    .select(FILM_UPLOAD_COLUMNS)
    .maybeSingle();
  if (queued) {
    if (extras) {
      const leased = await tryAcquireYoutubeLease(
        id,
        now,
        new Date(now.getTime() + leaseMs).toISOString(),
        owner
      );
      if (!leased) {
        await revertYoutubeQueuedClaim(id, stamp);
        return null;
      }
    }
    return queued as FilmUpload;
  }

  if (extras) {
    const acquired = await tryAcquireYoutubeLease(
      id,
      now,
      new Date(now.getTime() + leaseMs).toISOString(),
      owner
    );
    if (!acquired) return null;
    const { data: uploading, error } = await admin
      .from("game_film_uploads")
      .update({ youtube_status: "uploading", youtube_updated_at: stamp })
      .eq("id", id)
      .eq("youtube_status", "uploading")
      .select(FILM_UPLOAD_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (uploading as FilmUpload | null) ?? null;
  }

  const staleBefore = new Date(now.getTime() - YOUTUBE_STALE_MS).toISOString();
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
