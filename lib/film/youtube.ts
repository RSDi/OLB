// YouTube auto-push after a family upload finishes.
//
// Choice: a Vercel cron (every minute) plus after() on /film/complete, not a
// Supabase Edge Function. Phone videos can be up to 20 GB. Vercel (and Edge)
// will kill a one-shot upload long before that finishes. YouTube's resumable
// Data API lets us stream 64 MiB chunks (multiple of 256 KiB; override with
// FILM_YOUTUBE_CHUNK_BYTES) and store the session URI + byte offset on
// game_film_youtube_jobs. Each tick spends up to ~4 minutes, then the next
// cron continues immediately — a claimed_until + claimed_by lease replaces
// the old 4-minute idle gate (kept as a fallback if 0159 is not applied).
// after() on complete waits until the TUS object is actually readable
// (createSignedUrl "Object not found" is a missing/incomplete file, not a
// YouTube error), then starts the first chunks so a short clip may land
// before the next minute. Transient 5xx/429/network errors keep the session
// and resume from YouTube's Range; only 404/410 clear it. Same CRON_SECRET
// as the other jobs.

import { requireFilmObject } from "./object.ts";
import { getFilmTeamById, getFilmTeamBySlug } from "./teams.ts";
import { listGamePlayerNames } from "./lineups.ts";
import { createFilmSlackDraftIfNeeded } from "./slack-drafts.ts";
import { filmStorage } from "./storage.ts";
import {
  appendYoutubeEvent,
  applyYoutubeManualRetry,
  claimYoutubeWork,
  getFilmUpload,
  getYoutubeJob,
  latestYoutubeEventKind,
  patchYoutubeJobAndReleaseLease,
  listPlaylistWork,
  listYoutubeJobs,
  listYoutubeWork,
  probeYoutubeResumeColumns,
  releaseYoutubeClaim,
  setFilmPlaylistStatus,
  setFilmYoutubeStatus,
  teamYoutubePlaylistId,
  upsertYoutubeJob,
} from "./uploads.ts";
import {
  youtubeChunkBytes,
  youtubeDescription,
  youtubeInitiateHeaders,
  youtubeTitle,
  type YoutubeTemplateInput,
} from "./youtube-meta.ts";
import { refreshYoutubeAccess, youtubeOAuthConfigured } from "./youtube-oauth.ts";
import {
  YOUTUBE_LEASE_MS,
  canClaimYoutubeJob,
  classifyYoutubeFailure,
  planYoutubeContinuedHandoff,
  planYoutubeFailOrRequeue,
  runResumableUpload,
  youtubeManualRetryBlocked,
  youtubeManualRetryPatch,
  YoutubeAuthError,
  YoutubeSessionGoneError,
} from "./youtube-resume.ts";
import { insertYoutubePlaylistItem } from "./youtube-playlist.ts";
import {
  crossedMilestones,
  isYoutubeStalled,
} from "./youtube-progress.ts";
import { getYoutubeConnectionSecret } from "./youtube-settings.ts";
import { syncYoutubeVideoStatus } from "./youtube-status.ts";
import type { FilmUpload, YoutubeEventKind } from "./types.ts";

const INITIATE_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos?part=snippet";
export const YOUTUBE_TICK_BUDGET_MS = 240_000;
export const YOUTUBE_KICK_BUDGET_MS = 20_000;

export async function enqueueYoutubeIfConnected(uploadId: string): Promise<{ queued: boolean }> {
  if (!youtubeOAuthConfigured()) return { queued: false };
  const conn = await getYoutubeConnectionSecret().catch(() => null);
  if (!conn?.refreshToken) return { queued: false };
  const row = await getFilmUpload(uploadId);
  if (!row) return { queued: false };
  if (row.youtube_status === "done" || row.youtube_status === "queued" || row.youtube_status === "uploading") {
    return { queued: row.youtube_status !== "done" };
  }
  await upsertYoutubeJob(uploadId, { upload_uri: null, bytes_sent: 0, bytes_total: row.size_bytes });
  await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
  return { queued: true };
}

export async function retryYoutubeUpload(uploadId: string): Promise<void> {
  const row = await getFilmUpload(uploadId);
  if (!row) throw new Error("That upload isn't there any more.");
  if (row.youtube_status === "done") return;
  const job = await getYoutubeJob(uploadId);
  const blocked = youtubeManualRetryBlocked(job, Date.now());
  if (blocked) throw new Error(blocked);
  const patch = youtubeManualRetryPatch(job, row.size_bytes);
  await applyYoutubeManualRetry(uploadId, patch);
  await noteYoutubeEvent(
    uploadId,
    "retry",
    patch.upload_uri ? "Retry resumed" : "Retry started",
    null,
    patch.bytes_sent,
    row.size_bytes
  );
}

export type YoutubeTickResult = {
  processed: number;
  done: number;
  failed: number;
  continued: number;
  skipped: string | null;
};

export async function processYoutubeQueue(opts?: {
  budgetMs?: number;
  uploadId?: string;
  now?: number;
}): Promise<YoutubeTickResult> {
  const budgetMs = opts?.budgetMs ?? YOUTUBE_TICK_BUDGET_MS;
  const started = opts?.now ?? Date.now();
  const result: YoutubeTickResult = { processed: 0, done: 0, failed: 0, continued: 0, skipped: null };

  if (!youtubeOAuthConfigured()) {
    result.skipped = "YouTube OAuth env vars are not set.";
    return result;
  }

  let secret;
  try {
    secret = await getYoutubeConnectionSecret();
  } catch (err) {
    result.skipped = err instanceof Error ? err.message : "Couldn't read the YouTube connection.";
    return result;
  }
  const refreshToken = secret.refreshToken;
  if (!refreshToken) {
    result.skipped = "YouTube isn't connected.";
    return result;
  }

  let access: string;
  try {
    access = await refreshYoutubeAccess(refreshToken);
  } catch (err) {
    result.skipped = err instanceof Error ? err.message : "Couldn't refresh YouTube.";
    return result;
  }

  const extras = await probeYoutubeResumeColumns();
  if (!extras) {
    console.error(
      "[film-youtube] migration 0159 is not applied (next_attempt_at / claimed_until / claimed_by / transient_attempts missing). Using the 4-minute stale gate. Apply supabase/migrations/0159_game_film_youtube_resume.sql before deploy."
    );
  }

  const rows = await listYoutubeWork(opts?.uploadId);
  await markStalledUploads(rows, started);
  const jobs = await listYoutubeJobs(rows.map((row) => row.id));
  const jobById = new Map(jobs.map((job) => [job.upload_id, job]));
  const candidate =
    rows.find((row) => canClaim(row, started, jobById.get(row.id), extras)) ?? null;
  if (candidate) {
    const owner = crypto.randomUUID();
    const pick = await claimYoutubeWork(candidate.id, new Date(started), YOUTUBE_LEASE_MS, owner);
    if (pick) {
      result.processed = 1;
      try {
        const outcome = await pushOne(pick, {
          access,
          privacy: secret.privacyStatus,
          madeForKids: secret.madeForKids,
          deadline: started + budgetMs,
          refreshAccess: () => refreshYoutubeAccess(refreshToken),
        });
        if (outcome === "done") result.done = 1;
        else if (outcome === "failed") result.failed = 1;
        else result.continued = 1;
      } catch (err) {
        await failOrRequeue(pick.id, err, owner);
        const classified = classifyYoutubeFailure(err);
        if (classified.kind === "transient" || classified.kind === "storage_not_ready") {
          result.continued = 1;
        } else {
          result.failed = 1;
        }
      } finally {
        await releaseYoutubeClaim(pick.id, owner);
      }
    }
  }

  if (Date.now() < started + budgetMs) {
    await processPlaylistQueue({ access, uploadId: opts?.uploadId });
  }
  return result;
}

async function resolvePlaylistId(row: FilmUpload): Promise<string | null> {
  const override = row.youtube_playlist_id?.trim();
  if (override) return override;
  return teamYoutubePlaylistId(row.team_id, row.team);
}

export async function queuePlaylistIfNeeded(uploadId: string): Promise<void> {
  const row = await getFilmUpload(uploadId);
  if (!row?.youtube_video_id || row.youtube_status !== "done") return;
  if (row.youtube_playlist_status === "done") return;
  const playlistId = await resolvePlaylistId(row);
  if (!playlistId) return;
  if (row.youtube_playlist_status === "queued") return;
  await setFilmPlaylistStatus(uploadId, { youtube_playlist_status: "queued", youtube_playlist_error: null });
}

export async function retryPlaylistAdd(uploadId: string): Promise<void> {
  const row = await getFilmUpload(uploadId);
  if (!row) throw new Error("That upload isn't there any more.");
  if (row.youtube_status !== "done" || !row.youtube_video_id) {
    throw new Error("Send the video to YouTube before adding it to a playlist.");
  }
  const playlistId = await resolvePlaylistId(row);
  if (!playlistId) throw new Error("Set a playlist on this video or on the team in Settings → Film.");
  await setFilmPlaylistStatus(uploadId, { youtube_playlist_status: "queued", youtube_playlist_error: null });
}

async function processPlaylistQueue(opts: { access: string; uploadId?: string }): Promise<void> {
  const rows = await listPlaylistWork(opts.uploadId);
  for (const row of rows) {
    await addVideoToPlaylist(row, opts.access);
  }
}

async function addVideoToPlaylist(row: FilmUpload, access: string): Promise<void> {
  if (!row.youtube_video_id) return;
  const playlistId = await resolvePlaylistId(row);
  if (!playlistId) {
    await setFilmPlaylistStatus(row.id, { youtube_playlist_status: null, youtube_playlist_error: null });
    return;
  }
  try {
    const inserted = await insertYoutubePlaylistItem(access, playlistId, row.youtube_video_id);
    await setFilmPlaylistStatus(row.id, {
      youtube_playlist_status: "done",
      youtube_playlist_error: null,
      youtube_playlist_item_id: inserted.itemId,
    });
    await noteYoutubeEvent(row.id, "playlist_added", "Added to playlist");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add the video to the playlist.";
    await setFilmPlaylistStatus(row.id, {
      youtube_playlist_status: "failed",
      youtube_playlist_error: message,
    });
    await noteYoutubeEvent(row.id, "error", "Couldn't add the video to the playlist.", message);
  }
}

async function syncLiveStatusQuietly(access: string, videoId: string): Promise<void> {
  try {
    await syncYoutubeVideoStatus({ access, videoIds: [videoId], force: true });
  } catch {
    // Upload already succeeded. The cron will fill privacy on the next tick.
  }
}

function canClaim(
  row: FilmUpload,
  now: number,
  job?: { claimed_until?: string | null; next_attempt_at?: string | null } | null,
  extrasAvailable = true
): boolean {
  return canClaimYoutubeJob({
    youtubeStatus: row.youtube_status,
    claimedUntil: job?.claimed_until,
    nextAttemptAt: job?.next_attempt_at,
    youtubeUpdatedAt: row.youtube_updated_at,
    extrasAvailable,
    now,
  });
}

async function noteYoutubeEvent(
  uploadId: string,
  kind: YoutubeEventKind,
  message: string,
  detail?: string | null,
  bytesSent?: number | null,
  bytesTotal?: number | null
): Promise<void> {
  try {
    await appendYoutubeEvent({ uploadId, kind, message, detail, bytesSent, bytesTotal });
  } catch (err) {
    console.error("[film-youtube] event:", err instanceof Error ? err.message : err);
  }
}

async function markStalledUploads(rows: FilmUpload[], now: number): Promise<void> {
  const uploading = rows.filter((row) => row.youtube_status === "uploading");
  if (uploading.length === 0) return;
  const jobs = await listYoutubeJobs(uploading.map((row) => row.id));
  const byId = new Map(jobs.map((job) => [job.upload_id, job]));
  for (const row of uploading) {
    const job = byId.get(row.id);
    if (
      !isYoutubeStalled({
        youtubeStatus: row.youtube_status,
        lastProgressAt: job?.last_progress_at,
        youtubeUpdatedAt: row.youtube_updated_at,
        now,
      })
    ) {
      continue;
    }
    const lastKind = await latestYoutubeEventKind(row.id).catch(() => null);
    if (lastKind === "stalled") continue;
    await noteYoutubeEvent(
      row.id,
      "stalled",
      "No progress for 30 minutes",
      null,
      job?.bytes_sent ?? 0,
      job?.bytes_total ?? row.size_bytes
    );
  }
}

async function failOrRequeue(id: string, err: unknown, owner?: string): Promise<void> {
  const job = await getYoutubeJob(id);
  const plan = planYoutubeFailOrRequeue(err, job);
  if (owner) {
    const wrote = await patchYoutubeJobAndReleaseLease(id, owner, plan.jobPatch);
    if (!wrote) return;
  } else {
    await upsertYoutubeJob(id, plan.jobPatch);
  }
  if (plan.event) {
    await noteYoutubeEvent(
      id,
      plan.event.kind,
      plan.event.message,
      plan.event.detail,
      plan.event.bytesSent,
      job?.bytes_total ?? null
    );
  }
  await setFilmYoutubeStatus(id, {
    youtube_status: plan.youtubeStatus,
    youtube_error: plan.youtubeError,
  });
}

async function finishYoutubeUpload(
  row: FilmUpload,
  videoId: string,
  access: string,
  total: number
): Promise<"done"> {
  await setFilmYoutubeStatus(row.id, {
    youtube_status: "done",
    youtube_video_id: videoId,
    youtube_error: null,
  });
  await upsertYoutubeJob(row.id, { upload_uri: null, bytes_sent: total, bytes_total: total });
  await noteYoutubeEvent(row.id, "finished", "Finished on YouTube", null, total, total);
  await afterYoutubeInsert(row, videoId, access);
  await queuePlaylistIfNeeded(row.id);
  await addVideoToPlaylist({ ...row, youtube_status: "done", youtube_video_id: videoId }, access);
  await syncLiveStatusQuietly(access, videoId);
  return "done";
}

async function recordProgress(uploadId: string, prevSent: number, nextSent: number, total: number): Promise<void> {
  for (const pct of crossedMilestones(prevSent, nextSent, total)) {
    await noteYoutubeEvent(uploadId, "progress", `${pct}% uploaded`, null, nextSent, total);
  }
}

async function pushOne(
  row: FilmUpload,
  opts: {
    access: string;
    privacy: "unlisted" | "private" | "public";
    madeForKids: boolean;
    deadline: number;
    refreshAccess?: () => Promise<string>;
  }
): Promise<"done" | "continued" | "failed"> {
  const total = await requireFilmObject(row);
  const type = row.content_type || "video/mp4";
  let job =
    (await getYoutubeJob(row.id)) ??
    (await upsertYoutubeJob(row.id, { bytes_sent: 0, upload_uri: null, bytes_total: total }));

  if (!job.started_at && job.upload_uri) {
    job = await upsertYoutubeJob(row.id, { started_at: new Date().toISOString(), bytes_total: total });
  }

  const signed = await filmStorage().signedDownloadUrl(row.storage_path, 60 * 60);
  let startedNoted = Boolean(job.upload_uri && job.started_at);
  let access = opts.access;
  const result = await runResumableUpload({
    uploadUri: job.upload_uri,
    bytesSent: job.bytes_sent,
    total,
    access,
    signedUrl: signed,
    contentType: type,
    deadline: opts.deadline,
    chunkBytes: youtubeChunkBytes(),
    refreshAccess: async () => {
      if (!opts.refreshAccess) throw new YoutubeAuthError("YouTube login expired. Connect the channel again in Settings → Film.");
      access = await opts.refreshAccess();
      return access;
    },
    initiate: async (currentAccess) => {
      const uri = await initiateUpload(row, {
        access: currentAccess,
        privacy: opts.privacy,
        madeForKids: opts.madeForKids,
        total,
        type,
      });
      const startedAt = job.started_at ?? new Date().toISOString();
      job = await upsertYoutubeJob(row.id, {
        upload_uri: uri,
        bytes_sent: 0,
        bytes_total: total,
        started_at: startedAt,
        next_attempt_at: null,
      });
      if (!startedNoted) {
        await noteYoutubeEvent(row.id, "upload_started", "YouTube upload started", null, 0, total);
        startedNoted = true;
      }
      return uri;
    },
    onRetry: async (message, detail, bytesSent) => {
      await noteYoutubeEvent(row.id, "retry", message, detail, bytesSent, total);
    },
    onProgress: async (prevSent, nextSent) => {
      await upsertYoutubeJob(row.id, {
        bytes_sent: nextSent,
        bytes_total: total,
        next_attempt_at: null,
        transient_attempts: 0,
      });
      await recordProgress(row.id, prevSent, nextSent, total);
    },
  });

  if (result.outcome === "done") {
    if (!result.videoId) throw new Error("YouTube finished but didn't return a video id.");
    return finishYoutubeUpload(row, result.videoId, access, total);
  }
  if (result.outcome === "auth") throw new YoutubeAuthError(result.message);
  if (result.outcome === "failed") {
    const err = result.clearSession
      ? new YoutubeSessionGoneError(result.message)
      : new Error(result.message);
    throw err;
  }

  const fresh = (await getYoutubeJob(row.id)) ?? job;
  const handoff = planYoutubeContinuedHandoff(fresh, result);
  if (handoff.kind === "capped") {
    await upsertYoutubeJob(row.id, handoff.plan.jobPatch);
    if (handoff.plan.event) {
      await noteYoutubeEvent(
        row.id,
        handoff.plan.event.kind,
        handoff.plan.event.message,
        handoff.plan.event.detail,
        handoff.plan.event.bytesSent,
        fresh.bytes_total ?? total
      );
    }
    await setFilmYoutubeStatus(row.id, {
      youtube_status: handoff.plan.youtubeStatus,
      youtube_error: handoff.plan.youtubeError,
    });
    return handoff.plan.youtubeStatus === "failed" ? "failed" : "continued";
  }
  await upsertYoutubeJob(row.id, {
    ...handoff.jobPatch,
    bytes_total: total,
  });
  await setFilmYoutubeStatus(row.id, { youtube_status: "uploading", youtube_error: null });
  return "continued";
}

async function initiateUpload(
  row: FilmUpload,
  opts: {
    access: string;
    privacy: "unlisted" | "private" | "public";
    madeForKids: boolean;
    total: number;
    type: string;
  }
): Promise<string> {
  const ctx = await filmYoutubeContext(row);
  const body = JSON.stringify({
    snippet: {
      title: youtubeTitle(ctx.input),
      description: youtubeDescription(ctx.input),
      categoryId: "17",
    },
    status: {
      privacyStatus: opts.privacy,
      selfDeclaredMadeForKids: opts.madeForKids,
    },
  });
  const res = await fetch(INITIATE_URL, {
    method: "POST",
    headers: youtubeInitiateHeaders(opts.access, opts.total, opts.type),
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(youtubeErrorMessage(res.status, errText));
  }
  const location = res.headers.get("location");
  if (!location) throw new Error("YouTube didn't return an upload URL.");
  return location;
}

export { queryResumeOffset } from "./youtube-resume.ts";

async function filmYoutubeContext(row: FilmUpload): Promise<{
  teamId: string | null;
  slackChannelId: string | null;
  input: YoutubeTemplateInput;
}> {
  const team =
    (row.team_id ? await getFilmTeamById(row.team_id).catch(() => null) : null) ??
    (await getFilmTeamBySlug(row.team).catch(() => null));
  const extras = {
    includeStatsBook: team?.includeStatsBook ?? false,
    includePlayers: team?.includePlayers ?? false,
    includeTournament: team?.includeTournament ?? false,
    includePlaylistLink: team?.includePlaylistLink ?? false,
  };
  const players =
    extras.includePlayers && team?.id
      ? await listGamePlayerNames(team.id, row.game_date, row.opponent).catch(() => [])
      : [];
  const playlistId = row.youtube_playlist_id?.trim() || team?.youtubePlaylistId || null;
  return {
    teamId: team?.id ?? row.team_id,
    slackChannelId: team?.slackChannelId ?? null,
    input: {
      teamLabel: team?.label || row.team,
      opponent: row.opponent,
      gameDate: row.game_date,
      ourScore: row.our_score,
      theirScore: row.their_score,
      playlistId,
      players,
      extras,
      titleTemplate: team?.youtubeTitleTemplate,
      descriptionTemplate: team?.youtubeDescriptionTemplate,
      uploaderName: row.uploader_name,
    },
  };
}

async function afterYoutubeInsert(row: FilmUpload, videoId: string, access: string): Promise<void> {
  const ctx = await filmYoutubeContext(row);
  const title = youtubeTitle(ctx.input);
  const description = youtubeDescription({ ...ctx.input, youtubeVideoId: videoId });
  try {
    await updateYoutubeVideoSnippet(access, videoId, title, description);
  } catch (err) {
    console.error("[film-youtube] videos.update failed:", err instanceof Error ? err.message : err);
  }
  try {
    await createFilmSlackDraftIfNeeded({
      uploadId: row.id,
      teamId: ctx.teamId,
      channelId: ctx.slackChannelId,
      body: description,
    });
  } catch (err) {
    console.error("[film-youtube] slack draft failed:", err instanceof Error ? err.message : err);
  }
}

async function updateYoutubeVideoSnippet(
  access: string,
  videoId: string,
  title: string,
  description: string
): Promise<void> {
  const res = await fetch(VIDEOS_URL, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      id: videoId,
      snippet: {
        title,
        description,
        categoryId: "17",
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(youtubeErrorMessage(res.status, errText));
  }
}

function youtubeErrorMessage(status: number, body: string): string {
  if (status === 401) return "YouTube login expired. Connect the channel again in Settings → Film.";
  if (status === 403 && /unverified|verification/i.test(body)) {
    return "Google set the video private until the YouTube API app is verified.";
  }
  if (status === 403) return "YouTube refused the upload (check the connected channel and API quota).";
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet ? `YouTube ${status}: ${snippet}` : `YouTube returned ${status}.`;
}
