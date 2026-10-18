// YouTube auto-push after a family upload finishes.
//
// Choice: a Vercel cron (every minute) plus after() on /film/complete, not a
// Supabase Edge Function. Phone videos can be up to 20 GB. Vercel (and Edge)
// will kill a one-shot upload long before that finishes. YouTube's resumable
// Data API lets us PUT 8 MiB chunks and store the session URI + byte offset
// on game_film_youtube_jobs. Each tick spends up to ~4 minutes, then the next
// cron continues. after() on complete starts the first chunks so a short clip
// may land before the next minute. Same CRON_SECRET as the other jobs.

import { getFilmTeamById, getFilmTeamBySlug } from "./teams.ts";
import { listGamePlayerNames } from "./lineups.ts";
import { createFilmSlackDraftIfNeeded } from "./slack-drafts.ts";
import { filmStorage } from "./storage.ts";
import {
  claimYoutubeWork,
  getFilmUpload,
  getYoutubeJob,
  listPlaylistWork,
  listYoutubeWork,
  setFilmPlaylistStatus,
  setFilmYoutubeStatus,
  teamYoutubePlaylistId,
  upsertYoutubeJob,
} from "./uploads.ts";
import {
  YOUTUBE_MAX_ATTEMPTS,
  nextChunkRange,
  parseResumeRange,
  youtubeChunkHeaders,
  youtubeDescription,
  youtubeInitiateHeaders,
  youtubeTitle,
  type YoutubeTemplateInput,
} from "./youtube-meta.ts";
import { refreshYoutubeAccess, youtubeOAuthConfigured } from "./youtube-oauth.ts";
import { insertYoutubePlaylistItem } from "./youtube-playlist.ts";
import { getYoutubeConnectionSecret } from "./youtube-settings.ts";
import { syncYoutubeVideoStatus } from "./youtube-status.ts";
import type { FilmUpload } from "./types.ts";

const INITIATE_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos?part=snippet";
const STALE_MS = 4 * 60 * 1000;
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
  await upsertYoutubeJob(uploadId, { upload_uri: null, bytes_sent: 0 });
  await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
  return { queued: true };
}

export async function retryYoutubeUpload(uploadId: string): Promise<void> {
  const row = await getFilmUpload(uploadId);
  if (!row) throw new Error("That upload isn't there any more.");
  if (row.youtube_status === "done") return;
  const job = await getYoutubeJob(uploadId);
  await upsertYoutubeJob(uploadId, {
    upload_uri: null,
    bytes_sent: 0,
    attempts: job?.attempts ?? 0,
  });
  await setFilmYoutubeStatus(uploadId, { youtube_status: "queued", youtube_error: null });
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
  if (!secret.refreshToken) {
    result.skipped = "YouTube isn't connected.";
    return result;
  }

  let access: string;
  try {
    access = await refreshYoutubeAccess(secret.refreshToken);
  } catch (err) {
    result.skipped = err instanceof Error ? err.message : "Couldn't refresh YouTube.";
    return result;
  }

  const rows = await listYoutubeWork(opts?.uploadId);
  const candidate = rows.find((row) => canClaim(row, started)) ?? null;
  if (candidate) {
    const pick = await claimYoutubeWork(candidate.id, new Date(started));
    if (pick) {
      result.processed = 1;
      try {
        const outcome = await pushOne(pick, {
          access,
          privacy: secret.privacyStatus,
          madeForKids: secret.madeForKids,
          deadline: started + budgetMs,
        });
        if (outcome === "done") result.done = 1;
        else if (outcome === "failed") result.failed = 1;
        else result.continued = 1;
      } catch (err) {
        await failOrRequeue(pick.id, err instanceof Error ? err.message : "YouTube upload failed.");
        result.failed = 1;
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
  } catch (err) {
    await setFilmPlaylistStatus(row.id, {
      youtube_playlist_status: "failed",
      youtube_playlist_error: err instanceof Error ? err.message : "Couldn't add the video to the playlist.",
    });
  }
}

async function syncLiveStatusQuietly(access: string, videoId: string): Promise<void> {
  try {
    await syncYoutubeVideoStatus({ access, videoIds: [videoId], force: true });
  } catch {
    // Upload already succeeded. The cron will fill privacy on the next tick.
  }
}

function canClaim(row: FilmUpload, now: number): boolean {
  if (row.youtube_status === "queued") return true;
  if (row.youtube_status !== "uploading") return false;
  if (!row.youtube_updated_at) return true;
  return now - new Date(row.youtube_updated_at).getTime() > STALE_MS;
}

async function failOrRequeue(id: string, message: string): Promise<void> {
  const job = await getYoutubeJob(id);
  const attempts = (job?.attempts ?? 0) + 1;
  await upsertYoutubeJob(id, { attempts, upload_uri: null, bytes_sent: 0 });
  if (attempts >= YOUTUBE_MAX_ATTEMPTS) {
    await setFilmYoutubeStatus(id, { youtube_status: "failed", youtube_error: message });
  } else {
    await setFilmYoutubeStatus(id, { youtube_status: "queued", youtube_error: message });
  }
}

async function pushOne(
  row: FilmUpload,
  opts: { access: string; privacy: "unlisted" | "private" | "public"; madeForKids: boolean; deadline: number }
): Promise<"done" | "continued" | "failed"> {
  const total = await objectSize(row);
  const type = row.content_type || "video/mp4";
  let job = (await getYoutubeJob(row.id)) ?? (await upsertYoutubeJob(row.id, { bytes_sent: 0, upload_uri: null }));

  if (!job.upload_uri) {
    const uri = await initiateUpload(row, { access: opts.access, privacy: opts.privacy, madeForKids: opts.madeForKids, total, type });
    job = await upsertYoutubeJob(row.id, { upload_uri: uri, bytes_sent: 0 });
  } else {
    const resume = await queryResumeOffset(job.upload_uri, opts.access, total);
    if (resume.videoId) {
      await setFilmYoutubeStatus(row.id, {
        youtube_status: "done",
        youtube_video_id: resume.videoId,
        youtube_error: null,
      });
      await upsertYoutubeJob(row.id, { upload_uri: null, bytes_sent: total });
      await afterYoutubeInsert(row, resume.videoId, opts.access);
      await queuePlaylistIfNeeded(row.id);
      await addVideoToPlaylist({ ...row, youtube_status: "done", youtube_video_id: resume.videoId }, opts.access);
      await syncLiveStatusQuietly(opts.access, resume.videoId);
      return "done";
    }
    if (resume.sent !== job.bytes_sent) {
      job = await upsertYoutubeJob(row.id, { bytes_sent: resume.sent });
    }
  }

  let bytesSent = job.bytes_sent;
  const storage = filmStorage();

  while (Date.now() < opts.deadline) {
    const range = nextChunkRange(bytesSent, total);
    if (!range) break;
    const signed = await storage.signedDownloadUrl(row.storage_path, 60 * 60);
    const chunk = await fetch(signed, { headers: { Range: `bytes=${range.start}-${range.end}` } });
    if (!chunk.ok && chunk.status !== 206) {
      throw new Error(`Couldn't read film bytes (${chunk.status}).`);
    }
    const buf = Buffer.from(await chunk.arrayBuffer());
    const put = await fetch(job.upload_uri!, {
      method: "PUT",
      headers: youtubeChunkHeaders(opts.access, range.start, range.start + buf.length - 1, total, type),
      body: buf,
    });
    if (put.status === 200 || put.status === 201) {
      const json = (await put.json().catch(() => ({}))) as { id?: string };
      if (!json.id) throw new Error("YouTube finished but didn't return a video id.");
      await setFilmYoutubeStatus(row.id, {
        youtube_status: "done",
        youtube_video_id: json.id,
        youtube_error: null,
      });
      await upsertYoutubeJob(row.id, { upload_uri: null, bytes_sent: total });
      await afterYoutubeInsert(row, json.id, opts.access);
      await queuePlaylistIfNeeded(row.id);
      await addVideoToPlaylist({ ...row, youtube_status: "done", youtube_video_id: json.id }, opts.access);
      await syncLiveStatusQuietly(opts.access, json.id);
      return "done";
    }
    if (put.status === 308) {
      bytesSent = parseResumeRange(put.headers.get("range")) || range.start + buf.length;
      await upsertYoutubeJob(row.id, { bytes_sent: bytesSent });
      continue;
    }
    const errText = await put.text().catch(() => "");
    throw new Error(youtubeErrorMessage(put.status, errText));
  }

  await setFilmYoutubeStatus(row.id, { youtube_status: "uploading", youtube_error: null });
  return bytesSent >= total ? "continued" : "continued";
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

async function queryResumeOffset(
  uploadUri: string,
  access: string,
  total: number
): Promise<{ sent: number; videoId?: string }> {
  const res = await fetch(uploadUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${total}`,
    },
  });
  if (res.status === 200 || res.status === 201) {
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: total, videoId: json.id };
  }
  if (res.status === 308) return { sent: parseResumeRange(res.headers.get("range")) };
  if (res.status === 404) return { sent: 0 };
  return { sent: 0 };
}

async function objectSize(row: FilmUpload): Promise<number> {
  if (row.size_bytes && row.size_bytes > 0) return row.size_bytes;
  const signed = await filmStorage().signedDownloadUrl(row.storage_path, 120);
  const head = await fetch(signed, { method: "HEAD" });
  const len = Number(head.headers.get("content-length") ?? 0);
  if (!Number.isFinite(len) || len <= 0) throw new Error("Couldn't tell how large that video is.");
  return len;
}

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
