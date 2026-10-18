// Read-only YouTube privacy + processing for film already on the channel.
//
// videos.list?part=status is enough: privacyStatus and uploadStatus. That
// call is covered by the youtube.readonly scope we already request. This
// module never updates a YouTube video.

import { refreshYoutubeAccess, youtubeOAuthConfigured } from "./youtube-oauth.ts";
import { getYoutubeConnectionSecret } from "./youtube-settings.ts";
import { listFilmYoutubeVideos, setFilmYoutubeLiveStatus } from "./uploads.ts";
import {
  fetchYoutubeVideoStatuses,
  isYoutubeStatusStale,
} from "./youtube-live.ts";

export {
  YOUTUBE_STATUS_CRON_LIMIT,
  fetchYoutubeVideoStatuses,
  isYoutubeStatusStale,
} from "./youtube-live.ts";

export type YoutubeStatusSyncResult = {
  considered: number;
  updated: number;
  skipped: string | null;
};

async function youtubeAccessToken(existing?: string): Promise<{ access: string } | { skipped: string }> {
  if (existing) return { access: existing };
  if (!youtubeOAuthConfigured()) return { skipped: "YouTube OAuth env vars are not set." };
  let secret;
  try {
    secret = await getYoutubeConnectionSecret();
  } catch (err) {
    return { skipped: err instanceof Error ? err.message : "Couldn't read the YouTube connection." };
  }
  if (!secret.refreshToken) return { skipped: "YouTube isn't connected." };
  try {
    return { access: await refreshYoutubeAccess(secret.refreshToken) };
  } catch (err) {
    return { skipped: err instanceof Error ? err.message : "Couldn't refresh YouTube." };
  }
}

export async function syncYoutubeVideoStatus(opts?: {
  access?: string;
  videoIds?: string[];
  teamIds?: string[];
  force?: boolean;
  now?: Date;
  limit?: number;
}): Promise<YoutubeStatusSyncResult> {
  const token = await youtubeAccessToken(opts?.access);
  if ("skipped" in token) return { considered: 0, updated: 0, skipped: token.skipped };

  const rows = await listFilmYoutubeVideos({
    teamIds: opts?.teamIds,
    videoIds: opts?.videoIds,
  });
  const now = opts?.now?.getTime() ?? Date.now();
  const stale = opts?.force ? rows : rows.filter((row) => isYoutubeStatusStale(row, now));
  const limited = typeof opts?.limit === "number" ? stale.slice(0, opts.limit) : stale;
  if (limited.length === 0) return { considered: 0, updated: 0, skipped: null };

  const ids = [...new Set(limited.map((row) => row.youtube_video_id).filter((id): id is string => Boolean(id)))];
  const live = await fetchYoutubeVideoStatuses(token.access, ids);
  const byVideo = new Map(live.map((item) => [item.videoId, item]));

  let updated = 0;
  for (const row of limited) {
    const item = row.youtube_video_id ? byVideo.get(row.youtube_video_id) : null;
    if (!item) continue;
    await setFilmYoutubeLiveStatus(row.id, {
      youtube_privacy: item.youtube_privacy,
      youtube_processing: item.youtube_processing,
    });
    updated += 1;
  }
  return { considered: limited.length, updated, skipped: null };
}
