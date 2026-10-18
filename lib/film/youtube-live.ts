// Pure helpers for YouTube videos.list part=status. Safe to import from
// tests and the client. The server persist path lives in youtube-status.ts.

import type { FilmUpload, YoutubePrivacy, YoutubeProcessing } from "./types.ts";

export const YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
export const YOUTUBE_STATUS_BATCH = 50;
export const YOUTUBE_STATUS_PART = "status";

// Still-processing videos: check again after a couple of minutes.
// Finished (or gone) videos: a light pass every few hours is enough.
export const YOUTUBE_PROCESSING_SYNC_MS = 2 * 60 * 1000;
export const YOUTUBE_READY_SYNC_MS = 6 * 60 * 60 * 1000;
export const YOUTUBE_STATUS_CRON_LIMIT = 200;

export type YoutubeLiveStatus = {
  videoId: string;
  youtube_privacy: YoutubePrivacy | null;
  youtube_processing: YoutubeProcessing;
};

export type VideosListItem = {
  id?: string;
  status?: {
    privacyStatus?: string;
    uploadStatus?: string;
  };
};

export function parseYoutubePrivacy(raw: unknown): YoutubePrivacy | null {
  if (raw === "public" || raw === "unlisted" || raw === "private") return raw;
  return null;
}

export function parseYoutubeProcessing(raw: unknown): YoutubeProcessing | null {
  if (
    raw === "uploaded" ||
    raw === "processed" ||
    raw === "failed" ||
    raw === "rejected" ||
    raw === "deleted" ||
    raw === "missing"
  ) {
    return raw;
  }
  return null;
}

export function chunkIds(ids: string[], size = YOUTUBE_STATUS_BATCH): string[][] {
  const out: string[][] = [];
  const clean = ids.map((id) => id.trim()).filter(Boolean);
  for (let i = 0; i < clean.length; i += size) out.push(clean.slice(i, i + size));
  return out;
}

export function applyVideosListItems(requestedIds: string[], items: VideosListItem[] | undefined): YoutubeLiveStatus[] {
  const byId = new Map<string, YoutubeLiveStatus>();
  for (const item of items ?? []) {
    if (!item?.id) continue;
    byId.set(item.id, {
      videoId: item.id,
      youtube_privacy: parseYoutubePrivacy(item.status?.privacyStatus),
      youtube_processing: parseYoutubeProcessing(item.status?.uploadStatus) ?? "missing",
    });
  }
  return requestedIds.map(
    (id) =>
      byId.get(id) ?? {
        videoId: id,
        youtube_privacy: null,
        youtube_processing: "missing",
      }
  );
}

export function isYoutubeStatusStale(
  row: Pick<FilmUpload, "youtube_synced_at" | "youtube_processing">,
  now = Date.now(),
  windows?: { processingMs?: number; readyMs?: number }
): boolean {
  if (!row.youtube_synced_at) return true;
  const age = now - new Date(row.youtube_synced_at).getTime();
  if (!Number.isFinite(age)) return true;
  const stillWorking = row.youtube_processing === "uploaded" || row.youtube_processing == null;
  const windowMs = stillWorking
    ? (windows?.processingMs ?? YOUTUBE_PROCESSING_SYNC_MS)
    : (windows?.readyMs ?? YOUTUBE_READY_SYNC_MS);
  return age >= windowMs;
}

export function youtubeStatusListUrl(videoIds: string[]): string {
  const url = new URL(YOUTUBE_VIDEOS_URL);
  url.searchParams.set("part", YOUTUBE_STATUS_PART);
  url.searchParams.set("id", videoIds.join(","));
  return url.toString();
}

export async function fetchYoutubeVideoStatuses(
  access: string,
  videoIds: string[],
  fetchImpl: typeof fetch = fetch
): Promise<YoutubeLiveStatus[]> {
  const out: YoutubeLiveStatus[] = [];
  for (const batch of chunkIds(videoIds)) {
    const res = await fetchImpl(youtubeStatusListUrl(batch), {
      method: "GET",
      headers: { Authorization: `Bearer ${access}` },
    });
    const json = (await res.json().catch(() => ({}))) as {
      items?: VideosListItem[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message || youtubeStatusHttpError(res.status));
    }
    out.push(...applyVideosListItems(batch, json.items));
  }
  return out;
}

function youtubeStatusHttpError(status: number): string {
  if (status === 401) return "YouTube login expired. Connect the channel again in Settings → Film.";
  if (status === 403) return "YouTube refused the status read (check the connected channel and API quota).";
  return `YouTube returned ${status}.`;
}
