// Pure YouTube-transfer display: progress, stall, ETA, and plain-English
// errors. Safe to import from client components. Persistence lives on
// game_film_youtube_jobs; this module only formats what the worker stored.

import { formatBytes } from "./guest-status.ts";
import type { YoutubeStatus } from "./types.ts";

export const YOUTUBE_STALL_MS = 30 * 60 * 1000;
export const STORAGE_GRACE_MS = 15 * 60 * 1000;
export const YOUTUBE_PROGRESS_MILESTONES = [10, 25, 50, 75, 90] as const;

export type YoutubeEventKind =
  | "received"
  | "upload_started"
  | "progress"
  | "finished"
  | "playlist_added"
  | "retry"
  | "error"
  | "stalled";

export type YoutubeDisplayStatus = "queued" | "uploading" | "stalled" | "failed" | "done";

export type YoutubeErrorView = {
  message: string;
  raw: string;
  known: boolean;
};

export type YoutubeProgressView = {
  percent: number;
  bytesSent: number;
  bytesTotal: number;
  etaMs: number | null;
  startedAt: string | null;
  lastProgressAt: string | null;
};

export type YoutubeJobView = {
  upload_id: string;
  upload_uri: string | null;
  bytes_sent: number;
  bytes_total: number | null;
  attempts: number;
  started_at: string | null;
  last_progress_at: string | null;
  updated_at: string;
};

export type YoutubeEventView = {
  id: string;
  upload_id: string;
  at: string;
  kind: YoutubeEventKind;
  message: string;
  detail: string | null;
  bytes_sent: number | null;
  bytes_total: number | null;
};

export function isYoutubeStalled(input: {
  youtubeStatus: YoutubeStatus | null;
  lastProgressAt?: string | null;
  youtubeUpdatedAt?: string | null;
  now?: number;
  stallMs?: number;
}): boolean {
  if (input.youtubeStatus !== "uploading") return false;
  const now = input.now ?? Date.now();
  const stallMs = input.stallMs ?? YOUTUBE_STALL_MS;
  const stamp = input.lastProgressAt || input.youtubeUpdatedAt;
  if (!stamp) return true;
  const at = new Date(stamp).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at >= stallMs;
}

export function youtubeDisplayStatus(input: {
  youtubeStatus: YoutubeStatus | null;
  lastProgressAt?: string | null;
  youtubeUpdatedAt?: string | null;
  now?: number;
}): YoutubeDisplayStatus | null {
  if (!input.youtubeStatus) return null;
  if (input.youtubeStatus === "uploading" && isYoutubeStalled(input)) return "stalled";
  return input.youtubeStatus;
}

export function youtubeWorkLabel(status: YoutubeDisplayStatus | null, videoId?: string | null): string | null {
  if (status === "done" && videoId) return "On YouTube";
  if (status === "done") return "On YouTube";
  if (status === "queued") return "Queued for YouTube";
  if (status === "uploading") return "Uploading to YouTube";
  if (status === "stalled") return "Stalled";
  if (status === "failed") return "YouTube failed";
  return null;
}

export function progressPercent(bytesSent: number, bytesTotal: number): number {
  if (!Number.isFinite(bytesSent) || !Number.isFinite(bytesTotal) || bytesTotal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((bytesSent / bytesTotal) * 100)));
}

export function youtubeEtaMs(input: {
  bytesSent: number;
  bytesTotal: number;
  startedAt?: string | null;
  now?: number;
}): number | null {
  const sent = input.bytesSent;
  const total = input.bytesTotal;
  if (!input.startedAt || sent <= 0 || total <= 0 || sent >= total) return null;
  const started = new Date(input.startedAt).getTime();
  const now = input.now ?? Date.now();
  const elapsed = now - started;
  if (!Number.isFinite(started) || elapsed < 5_000) return null;
  const rate = sent / elapsed;
  if (rate <= 0) return null;
  return Math.round((total - sent) / rate);
}

export function youtubeProgressView(input: {
  bytesSent?: number | null;
  bytesTotal?: number | null;
  sizeBytes?: number | null;
  startedAt?: string | null;
  lastProgressAt?: string | null;
  now?: number;
}): YoutubeProgressView | null {
  const bytesSent = Math.max(0, input.bytesSent ?? 0);
  const bytesTotal = Math.max(0, input.bytesTotal ?? input.sizeBytes ?? 0);
  if (bytesTotal <= 0 && bytesSent <= 0 && !input.startedAt) return null;
  return {
    percent: progressPercent(bytesSent, bytesTotal),
    bytesSent,
    bytesTotal,
    etaMs: youtubeEtaMs({
      bytesSent,
      bytesTotal,
      startedAt: input.startedAt,
      now: input.now,
    }),
    startedAt: input.startedAt ?? null,
    lastProgressAt: input.lastProgressAt ?? null,
  };
}

export function formatEta(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return "less than a minute left";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `about ${minutes} min left`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hr left`;
}

export function formatStartedAt(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  const time = at.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = new Date(now).toDateString() === at.toDateString();
  if (sameDay) return `started ${time}`;
  const day = at.toLocaleString("en-US", { month: "short", day: "numeric" });
  return `started ${day}, ${time}`;
}

export function youtubeProgressLine(view: YoutubeProgressView, now = Date.now()): string {
  const parts: string[] = [];
  if (view.bytesTotal > 0) {
    parts.push(`${view.percent}%`);
    parts.push(`${formatBytes(view.bytesSent)} of ${formatBytes(view.bytesTotal)}`);
  } else if (view.bytesSent > 0) {
    parts.push(formatBytes(view.bytesSent));
  }
  const eta = formatEta(view.etaMs);
  if (eta) parts.push(eta);
  const started = formatStartedAt(view.startedAt, now);
  if (started) parts.push(started);
  return parts.join(" · ");
}

export function crossedMilestones(prevSent: number, nextSent: number, total: number): number[] {
  if (total <= 0) return [];
  const prev = progressPercent(prevSent, total);
  const next = progressPercent(nextSent, total);
  return YOUTUBE_PROGRESS_MILESTONES.filter((n) => prev < n && next >= n);
}

export function youtubeEventTitle(kind: YoutubeEventKind): string {
  switch (kind) {
    case "received":
      return "File received";
    case "upload_started":
      return "YouTube upload started";
    case "progress":
      return "Upload progress";
    case "finished":
      return "Finished on YouTube";
    case "playlist_added":
      return "Added to playlist";
    case "retry":
      return "Retry started";
    case "error":
      return "Error";
    case "stalled":
      return "Stalled";
  }
}

export function mapYoutubeError(raw: string | null | undefined): YoutubeErrorView | null {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const lower = text.toLowerCase();

  if (
    lower.includes("object not found") ||
    lower.includes("the resource was not found") ||
    /couldn't read film bytes \(404\)/.test(lower) ||
    /couldn.t make a download link/.test(lower)
  ) {
    return {
      message: "The video file isn't in storage; the upload from the phone may not have finished. Ask the uploader to re-upload.",
      raw: text,
      known: true,
    };
  }
  if (lower.includes("incomplete") && (lower.includes("storage") || lower.includes("object") || lower.includes("film"))) {
    return {
      message: "The video file in storage is incomplete. The upload from the phone may not have finished. Ask the uploader to re-upload.",
      raw: text,
      known: true,
    };
  }
  if (lower.includes("login expired") || lower.includes("connect the channel again") || /\byoutube 401\b/.test(lower)) {
    return {
      message: "YouTube login expired. Connect the channel again in Settings → Film.",
      raw: text,
      known: true,
    };
  }
  if (/unverified|verification/.test(lower) && /private|403/.test(lower)) {
    return {
      message: "Google set the video private until the YouTube API app is verified.",
      raw: text,
      known: true,
    };
  }
  if (lower.includes("quota") || (lower.includes("youtube refused") && lower.includes("403"))) {
    return {
      message: "YouTube refused the upload (check the connected channel and API quota).",
      raw: text,
      known: true,
    };
  }
  if (lower.includes("couldn't tell how large") || lower.includes("couldn’t tell how large")) {
    return {
      message: "We couldn't read the file size from storage. Ask the uploader to re-upload.",
      raw: text,
      known: true,
    };
  }
  if (
    lower.includes("didn't return an upload url") ||
    lower.includes("didn’t return an upload url") ||
    lower.includes("upload session expired") ||
    lower.includes("resumable") && lower.includes("404")
  ) {
    return {
      message: "The YouTube upload session expired. Tap Retry YouTube to start a new one.",
      raw: text,
      known: true,
    };
  }
  if (lower.includes("youtube isn't connected") || lower.includes("youtube isn’t connected")) {
    return {
      message: "YouTube isn't connected. Connect the channel in Settings → Film.",
      raw: text,
      known: true,
    };
  }

  return { message: text, raw: text, known: false };
}

export function formatEventWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
