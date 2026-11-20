// Upload speed, time left, and "is this video bigger than it needs to be?"
// for the parent upload page, plus the numbers it reports to /film/complete
// so coaches can see whether a slow upload was the connection or the file.
// Browser-safe: no server imports.

/** Speed is averaged over this much recent upload time. */
export const SPEED_WINDOW_MS = 20_000;
/** A gap longer than this between progress events is a pause (phone locked,
 * app switched), not slow uploading: it doesn't count toward speed or time. */
export const PAUSE_GAP_MS = 30_000;
/** Don't show a time-left guess until this much upload time is measured. */
export const MIN_ESTIMATE_MS = 5_000;

/** Rough iPhone bitrate for 1080p at 30 fps (HEVC ≈ 60 MB a minute). */
export const BITRATE_1080P30_MBPS = 8;
/** Above this, a 1080p video was probably recorded at 60 fps. */
export const HIGH_BITRATE_MBPS = 14;

export type SpeedMeter = {
  samples: { at: number; bytes: number }[];
  activeMs: number;
  sentBytes: number;
  lastAt: number | null;
  lastBytes: number;
};

export function newSpeedMeter(): SpeedMeter {
  return { samples: [], activeMs: 0, sentBytes: 0, lastAt: null, lastBytes: 0 };
}

/** Record that `bytes` of the file are up as of `at`. Returns the same meter. */
export function recordProgress(meter: SpeedMeter, bytes: number, at: number): SpeedMeter {
  if (meter.lastAt !== null && bytes >= meter.lastBytes) {
    const gap = at - meter.lastAt;
    if (gap <= PAUSE_GAP_MS) {
      meter.activeMs += Math.max(0, gap);
      meter.sentBytes += bytes - meter.lastBytes;
    } else {
      meter.samples = [];
    }
  } else if (bytes < meter.lastBytes) {
    // Upload restarted from an earlier offset: start the window over.
    meter.samples = [];
  }
  meter.lastAt = at;
  meter.lastBytes = bytes;
  meter.samples.push({ at, bytes });
  while (meter.samples.length > 2 && at - meter.samples[0].at > SPEED_WINDOW_MS) meter.samples.shift();
  return meter;
}

/** Recent speed in megabits per second, or null until there's enough to say. */
export function currentMbps(meter: SpeedMeter): number | null {
  const s = meter.samples;
  if (s.length < 2) return null;
  const ms = s[s.length - 1].at - s[0].at;
  if (ms < MIN_ESTIMATE_MS) return null;
  const bytes = s[s.length - 1].bytes - s[0].bytes;
  if (bytes <= 0) return null;
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

export function secondsLeft(meter: SpeedMeter, totalBytes: number): number | null {
  const mbps = currentMbps(meter);
  if (!mbps || totalBytes <= 0) return null;
  const remaining = Math.max(0, totalBytes - meter.lastBytes);
  return (remaining * 8) / (mbps * 1_000_000);
}

/** Speed over the whole time this page was actively uploading. */
export function averageMbps(meter: SpeedMeter): number | null {
  if (meter.activeMs < MIN_ESTIMATE_MS || meter.sentBytes <= 0) return null;
  return (meter.sentBytes * 8) / (meter.activeMs / 1000) / 1_000_000;
}

export function formatMbps(mbps: number): string {
  if (mbps < 1) return `${mbps.toFixed(1)} Mbps`;
  return `${Math.round(mbps)} Mbps`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "under a minute";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return "Less than a minute left";
  return `About ${formatDuration(seconds)} left`;
}

export type VideoProbe = { width: number; height: number; durationSeconds: number };

export type VideoSizeAdvice = {
  kind: "4k" | "high" | "ok";
  /** How many times bigger than a 1080p/30 recording, rounded; 1 when ok. */
  times: number;
  message: string | null;
};

const RECORD_TIP = "Next time, set iPhone: Settings → Camera → Record Video → 1080p at 30 fps.";

/** Is this video bigger than it needs to be for game film? */
export function videoSizeAdvice(probe: VideoProbe | null, sizeBytes: number): VideoSizeAdvice {
  if (!probe) return { kind: "ok", times: 1, message: null };
  const longSide = Math.max(probe.width, probe.height);
  const mbps =
    probe.durationSeconds > 0 && sizeBytes > 0 ? (sizeBytes * 8) / probe.durationSeconds / 1_000_000 : null;
  const times = mbps ? Math.max(1, Math.round(mbps / BITRATE_1080P30_MBPS)) : 1;
  if (longSide >= 3000) {
    const t = Math.max(times, 3);
    return {
      kind: "4k",
      times: t,
      message: `This video is 4K, so it's about ${t}× bigger than it needs to be and takes about ${t}× longer to upload. It will still get there. ${RECORD_TIP}`,
    };
  }
  if (mbps && mbps > HIGH_BITRATE_MBPS && times >= 2) {
    return {
      kind: "high",
      times,
      message: `This video was recorded at a high setting (probably 60 fps), so it's about ${times}× bigger than it needs to be. It will still get there. ${RECORD_TIP}`,
    };
  }
  return { kind: "ok", times: 1, message: null };
}

export type UploadStatsInput = {
  activeSeconds?: unknown;
  sentBytes?: unknown;
  resumed?: unknown;
  videoWidth?: unknown;
  videoHeight?: unknown;
  videoDurationSeconds?: unknown;
};

export type UploadStatsRow = {
  upload_seconds: number | null;
  upload_mbps: number | null;
  video_width: number | null;
  video_height: number | null;
  video_duration_s: number | null;
};

function intIn(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

/** Server side: clamp what the phone reported into columns. */
export function uploadStatsRow(input: UploadStatsInput | null | undefined): UploadStatsRow {
  const s = input ?? {};
  const seconds = intIn(s.activeSeconds, 1, 7 * 24 * 3600);
  const sent = typeof s.sentBytes === "number" && Number.isFinite(s.sentBytes) && s.sentBytes > 0 ? s.sentBytes : null;
  const mbps = seconds && sent ? Math.round(((sent * 8) / seconds / 1_000_000) * 100) / 100 : null;
  return {
    // A resumed upload only timed the last stretch, so its time isn't the whole story.
    upload_seconds: s.resumed === true ? null : seconds,
    upload_mbps: mbps !== null && mbps > 0 && mbps < 100_000 ? mbps : null,
    video_width: intIn(s.videoWidth, 1, 20_000),
    video_height: intIn(s.videoHeight, 1, 20_000),
    video_duration_s: intIn(s.videoDurationSeconds, 1, 24 * 3600),
  };
}

/** Coach-facing summary, e.g. "4K · uploaded in 61 min at 14 Mbps". */
export function formatUploadStats(row: Partial<UploadStatsRow>): string | null {
  const parts: string[] = [];
  const longSide = Math.max(row.video_width ?? 0, row.video_height ?? 0);
  if (longSide >= 3000) parts.push("4K");
  else if (longSide >= 1900) parts.push("1080p");
  else if (longSide >= 1200) parts.push("720p");
  const took = row.upload_seconds ? `uploaded in ${formatDuration(row.upload_seconds)}` : null;
  const speed = row.upload_mbps ? `${formatMbps(Number(row.upload_mbps))}` : null;
  if (took && speed) parts.push(`${took} at ${speed}`);
  else if (took) parts.push(took);
  else if (speed) parts.push(`uploaded at ${speed}`);
  return parts.length ? parts.join(" · ") : null;
}
