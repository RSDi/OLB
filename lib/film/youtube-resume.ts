// Resumable YouTube Data API helpers for game film.
//
// Transient 5xx / 429 / network errors keep the session URI and byte
// offset. Only 404/410 on the session clear it. 401 refreshes the
// access token and retries; 403 keeps the session and fails. Before
// every resume we ask YouTube `Content-Range: bytes */total` and trust
// the Range header. A 308 with no Range is 0 bytes (or we probe), never
// a skipped chunk. In-tick retries use 1, 2, 4, … 64s with jitter;
// if the tick budget is too tight we hand off instead of failing.

import { YOUTUBE_MAX_ATTEMPTS, nextChunkRange, parseResumeRange, youtubeChunkHeaders } from "./youtube-meta.ts";

function isFilmStorageError(err: unknown): err is Error & { code: "missing" | "not_ready" | "incomplete" } {
  return err instanceof Error && err.name === "FilmStorageError" && "code" in err;
}

export const YOUTUBE_IN_TICK_TRIES = 6;
export const YOUTUBE_RETRY_RESERVE_MS = 8_000;
export const YOUTUBE_CHUNK_RESERVE_MS = 5_000;
export const YOUTUBE_LEASE_MS = 5 * 60 * 1000;
export const YOUTUBE_STALE_MS = 4 * 60 * 1000;
export const YOUTUBE_MAX_RETRY_DELAY_MS = 64_000;
export const YOUTUBE_MAX_TRANSIENT_ATTEMPTS = 20;
export const YOUTUBE_TRANSIENT_STALL_MS = 2 * 60 * 60 * 1000;
export const YOUTUBE_EXTRAS_RECHECK_MS = 60_000;

export type YoutubeIo = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
};

export type ResumeQueryResult =
  | { kind: "complete"; sent: number; videoId?: string }
  | { kind: "offset"; sent: number }
  | { kind: "expired" }
  | { kind: "auth"; status: number }
  | { kind: "unknown" };

export type YoutubeFailureKind =
  | "transient"
  | "session_gone"
  | "auth"
  | "storage_not_ready"
  | "storage_fatal"
  | "fatal";

export type YoutubeFailure = {
  kind: YoutubeFailureKind;
  message: string;
  clearSession: boolean;
  consumeAttempt: boolean;
};

export type RunUploadResult =
  | { outcome: "done"; videoId: string; bytesSent: number; uploadUri: string }
  | { outcome: "continued"; bytesSent: number; uploadUri: string; transient: boolean }
  | { outcome: "auth"; message: string }
  | { outcome: "failed"; message: string; clearSession: boolean; consumeAttempt: boolean };

export class YoutubeTransientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "YoutubeTransientError";
    this.status = status;
  }
}

export class YoutubeSessionGoneError extends Error {
  constructor(message = "YouTube upload session expired.") {
    super(message);
    this.name = "YoutubeSessionGoneError";
  }
}

export class YoutubeAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeAuthError";
  }
}

export function defaultYoutubeIo(): YoutubeIo {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    random: Math.random,
  };
}

export function youtubeRetryDelayMs(retryIndex: number, random: () => number = Math.random): number {
  const exp = Math.min(6, Math.max(0, Math.floor(retryIndex)));
  const base = Math.min(YOUTUBE_MAX_RETRY_DELAY_MS, 1000 * 2 ** exp);
  return Math.round(base * (0.5 + random() * 0.5));
}

export function canRetryInTick(
  now: number,
  deadline: number,
  delayMs: number,
  reserveMs = YOUTUBE_RETRY_RESERVE_MS
): boolean {
  return now + delayMs + reserveMs <= deadline;
}

export function isMissingYoutubeJobExtraColumn(message: string): boolean {
  const m = message.toLowerCase();
  if (
    !m.includes("next_attempt_at") &&
    !m.includes("claimed_until") &&
    !m.includes("claimed_by") &&
    !m.includes("transient_attempts")
  ) {
    return false;
  }
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache") ||
    m.includes("42703")
  );
}

export function youtubeLeaseExpired(claimedUntil: string | null | undefined, now: number): boolean {
  if (!claimedUntil) return true;
  const at = new Date(claimedUntil).getTime();
  return !Number.isFinite(at) || at <= now;
}

export function youtubeNextAttemptReady(nextAttemptAt: string | null | undefined, now: number): boolean {
  if (!nextAttemptAt) return true;
  const at = new Date(nextAttemptAt).getTime();
  return !Number.isFinite(at) || at <= now;
}

export function canReclaimUploadingWithoutLease(
  youtubeUpdatedAt: string | null | undefined,
  now: number,
  staleMs = YOUTUBE_STALE_MS
): boolean {
  if (!youtubeUpdatedAt) return true;
  const at = new Date(youtubeUpdatedAt).getTime();
  return !Number.isFinite(at) || now - at > staleMs;
}

export function canClaimYoutubeJob(input: {
  youtubeStatus: string | null;
  claimedUntil?: string | null;
  nextAttemptAt?: string | null;
  youtubeUpdatedAt?: string | null;
  extrasAvailable?: boolean;
  now: number;
}): boolean {
  if (!youtubeNextAttemptReady(input.nextAttemptAt, input.now)) return false;
  if (input.youtubeStatus === "queued") return true;
  if (input.youtubeStatus !== "uploading") return false;
  if (input.extrasAvailable === false) {
    return canReclaimUploadingWithoutLease(input.youtubeUpdatedAt, input.now);
  }
  return youtubeLeaseExpired(input.claimedUntil, input.now);
}

export type YoutubeLeaseRow = {
  uploadId: string;
  claimedUntil: string | null;
  claimedBy: string | null;
};

export function applyYoutubeLeaseAcquire(
  rows: Map<string, YoutubeLeaseRow>,
  id: string,
  now: number,
  leaseUntil: string,
  owner: string
): boolean {
  const row = rows.get(id);
  if (row && !youtubeLeaseExpired(row.claimedUntil, now)) return false;
  rows.set(id, { uploadId: id, claimedUntil: leaseUntil, claimedBy: owner });
  return true;
}

export function applyYoutubeLeaseRelease(rows: Map<string, YoutubeLeaseRow>, id: string, owner: string): boolean {
  const row = rows.get(id);
  if (!row || row.claimedBy !== owner) return false;
  rows.set(id, { ...row, claimedUntil: null, claimedBy: null });
  return true;
}

export function youtubeTransientCapReached(
  job: { transient_attempts?: number | null; last_progress_at?: string | null } | null,
  now: number
): boolean {
  const count = job?.transient_attempts ?? 0;
  if (count >= YOUTUBE_MAX_TRANSIENT_ATTEMPTS) return true;
  const last = job?.last_progress_at;
  if (!last || count <= 0) return false;
  const at = new Date(last).getTime();
  return Number.isFinite(at) && now - at >= YOUTUBE_TRANSIENT_STALL_MS;
}

export function classifyYoutubeHttpStatus(status: number): YoutubeFailureKind {
  if (status === 404 || status === 410) return "session_gone";
  if (status === 401 || status === 403) return "auth";
  if (status === 429 || status >= 500) return "transient";
  return "fatal";
}

const NETWORK_ERROR_RE = /fetch failed|network|econnreset|etimedout|enotfound|socket|other side closed|und_err|aborted|timeout/;

export function isTransientNetworkError(err: unknown): boolean {
  if (err instanceof YoutubeTransientError) return true;
  if (isFilmStorageError(err)) return false;
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const message = err.message.toLowerCase();
  const cause = "cause" in err && err.cause instanceof Error ? err.cause : null;
  const causeMsg = cause?.message.toLowerCase() ?? "";
  const causeCode =
    cause && "code" in cause ? String((cause as { code?: string }).code ?? "").toLowerCase() : "";
  if (err.name === "TypeError") {
    return NETWORK_ERROR_RE.test(`${message} ${causeMsg} ${causeCode}`);
  }
  return NETWORK_ERROR_RE.test(`${message} ${causeMsg} ${causeCode}`);
}

export function interpretResumeResponse(
  status: number,
  rangeHeader: string | null,
  videoId?: string,
  total = 0
): ResumeQueryResult {
  if (status === 200 || status === 201) {
    return { kind: "complete", sent: total, videoId };
  }
  if (status === 308) return { kind: "offset", sent: parseResumeRange(rangeHeader) };
  if (status === 404 || status === 410) return { kind: "expired" };
  if (status === 401 || status === 403) return { kind: "auth", status };
  return { kind: "unknown" };
}

export function classifyYoutubeFailure(err: unknown): YoutubeFailure {
  if (isFilmStorageError(err) && err.code === "not_ready") {
    return { kind: "storage_not_ready", message: err.message, clearSession: false, consumeAttempt: false };
  }
  if (isFilmStorageError(err)) {
    return { kind: "storage_fatal", message: err.message, clearSession: false, consumeAttempt: false };
  }
  if (err instanceof YoutubeSessionGoneError) {
    return { kind: "session_gone", message: err.message, clearSession: true, consumeAttempt: true };
  }
  if (err instanceof YoutubeAuthError) {
    return { kind: "auth", message: err.message, clearSession: false, consumeAttempt: true };
  }
  if (err instanceof YoutubeTransientError || isTransientNetworkError(err)) {
    const message = err instanceof Error ? err.message : "YouTube upload failed.";
    return { kind: "transient", message, clearSession: false, consumeAttempt: false };
  }
  const message = err instanceof Error ? err.message : "YouTube upload failed.";
  const lower = message.toLowerCase();
  if (/youtube upload session expired|resumable/.test(lower) && /404|410|expired/.test(lower)) {
    return { kind: "session_gone", message, clearSession: true, consumeAttempt: true };
  }
  if (/login expired|connect the channel again|\byoutube 401\b/.test(lower)) {
    return { kind: "auth", message, clearSession: false, consumeAttempt: true };
  }
  if (/\byoutube 403\b|youtube refused/.test(lower)) {
    return { kind: "auth", message, clearSession: false, consumeAttempt: true };
  }
  if (/\byoutube (429|5\d\d)\b|couldn't read film bytes \((429|5\d\d)\)/.test(lower)) {
    return { kind: "transient", message, clearSession: false, consumeAttempt: false };
  }
  if (/didn't return a video id/.test(lower)) {
    return { kind: "fatal", message, clearSession: false, consumeAttempt: false };
  }
  return { kind: "fatal", message, clearSession: false, consumeAttempt: true };
}

export function youtubeManualRetryPatch(job: {
  upload_uri: string | null;
  bytes_sent: number;
  bytes_total: number | null;
  attempts: number;
  started_at: string | null;
  last_progress_at: string | null;
} | null, sizeBytes: number | null): {
  upload_uri: string | null;
  bytes_sent: number;
  bytes_total: number | null;
  attempts: number;
  started_at: string | null;
  last_progress_at: string | null;
  next_attempt_at: null;
  claimed_until: null;
  claimed_by: null;
  transient_attempts: number;
} {
  if (job?.upload_uri) {
    return {
      upload_uri: job.upload_uri,
      bytes_sent: job.bytes_sent,
      bytes_total: job.bytes_total ?? sizeBytes,
      attempts: job.attempts,
      started_at: job.started_at,
      last_progress_at: job.last_progress_at,
      next_attempt_at: null,
      claimed_until: null,
      claimed_by: null,
      transient_attempts: 0,
    };
  }
  return {
    upload_uri: null,
    bytes_sent: 0,
    bytes_total: sizeBytes,
    attempts: job?.attempts ?? 0,
    started_at: null,
    last_progress_at: null,
    next_attempt_at: null,
    claimed_until: null,
    claimed_by: null,
    transient_attempts: 0,
  };
}

export type YoutubeRequeuePlan = {
  jobPatch: {
    upload_uri: string | null;
    bytes_sent: number;
    attempts?: number;
    next_attempt_at: string | null;
    transient_attempts?: number;
  };
  youtubeStatus: "queued" | "uploading" | "failed";
  youtubeError: string | null;
  event: { kind: "retry" | "error"; message: string; detail: string | null; bytesSent: number } | null;
};

export function planYoutubeFailOrRequeue(
  err: unknown,
  job: {
    upload_uri: string | null;
    bytes_sent: number;
    bytes_total: number | null;
    attempts: number;
    last_progress_at?: string | null;
    transient_attempts?: number | null;
  } | null,
  now = Date.now()
): YoutubeRequeuePlan {
  const classified = classifyYoutubeFailure(err);
  const message = classified.message;
  const bytes = job?.bytes_sent ?? 0;
  const uri = job?.upload_uri ?? null;
  if (classified.kind === "storage_not_ready") {
    return {
      jobPatch: { upload_uri: uri, bytes_sent: bytes, next_attempt_at: null },
      youtubeStatus: "queued",
      youtubeError: message,
      event: null,
    };
  }
  if (classified.kind === "storage_fatal") {
    return {
      jobPatch: { upload_uri: uri, bytes_sent: bytes, next_attempt_at: null },
      youtubeStatus: "failed",
      youtubeError: message,
      event: { kind: "error", message: "Error", detail: message, bytesSent: bytes },
    };
  }
  if (classified.kind === "transient") {
    const nextCount = (job?.transient_attempts ?? 0) + 1;
    const capped = youtubeTransientCapReached({ transient_attempts: nextCount, last_progress_at: job?.last_progress_at }, now);
    if (capped) {
      const attempts = (job?.attempts ?? 0) + 1;
      return {
        jobPatch: {
          upload_uri: uri,
          bytes_sent: bytes,
          attempts,
          next_attempt_at: null,
          transient_attempts: nextCount,
        },
        youtubeStatus: attempts >= YOUTUBE_MAX_ATTEMPTS ? "failed" : "queued",
        youtubeError: message,
        event: { kind: "error", message: "Error", detail: message, bytesSent: bytes },
      };
    }
    return {
      jobPatch: {
        upload_uri: uri,
        bytes_sent: bytes,
        next_attempt_at: new Date(now + youtubeRetryDelayMs(0, () => 0.5)).toISOString(),
        transient_attempts: nextCount,
      },
      youtubeStatus: "uploading",
      youtubeError: null,
      event: { kind: "retry", message: "Retrying after a temporary YouTube error", detail: message, bytesSent: bytes },
    };
  }
  const attempts = classified.consumeAttempt ? (job?.attempts ?? 0) + 1 : (job?.attempts ?? 0);
  const clear = classified.clearSession;
  const failNow = !classified.consumeAttempt || attempts >= YOUTUBE_MAX_ATTEMPTS;
  return {
    jobPatch: {
      upload_uri: clear ? null : uri,
      bytes_sent: clear ? 0 : bytes,
      attempts,
      next_attempt_at: null,
    },
    youtubeStatus: failNow ? "failed" : "queued",
    youtubeError: message,
    event: { kind: "error", message: "Error", detail: message, bytesSent: clear ? 0 : bytes },
  };
}

function abortSignalForDeadline(now: number, deadline: number): AbortSignal {
  const remaining = deadline - now;
  if (remaining <= 0) {
    const controller = new AbortController();
    controller.abort();
    return controller.signal;
  }
  return AbortSignal.timeout(remaining);
}

function headerGet(headers: HeadersInit | undefined, name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name.toLowerCase());
    return found?.[1] ?? null;
  }
  const rec = headers as Record<string, string>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? rec[key] ?? null : null;
}

export function isYoutubeResumeProbe(init?: RequestInit | null): boolean {
  const range = headerGet(init?.headers, "Content-Range") ?? "";
  return /^bytes \*\//i.test(range.trim());
}

export async function queryResumeOffset(
  uploadUri: string,
  access: string,
  total: number,
  io: YoutubeIo = defaultYoutubeIo(),
  deadline?: number
): Promise<ResumeQueryResult> {
  try {
    const res = await io.fetch(uploadUri, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Length": "0",
        "Content-Range": `bytes */${total}`,
      },
      ...(deadline != null ? { signal: abortSignalForDeadline(io.now(), deadline) } : {}),
    });
    if (res.status === 200 || res.status === 201) {
      const json = (await res.json().catch(() => ({}))) as { id?: string };
      return interpretResumeResponse(res.status, res.headers.get("range"), json.id, total);
    }
    return interpretResumeResponse(res.status, res.headers.get("range"), undefined, total);
  } catch (err) {
    if (isTransientNetworkError(err)) return { kind: "unknown" };
    throw err;
  }
}

export async function queryResumeOffsetWithRetry(
  uploadUri: string,
  access: string,
  total: number,
  opts: {
    deadline: number;
    io?: Partial<YoutubeIo>;
    onRetry?: (message: string, detail: string | null, bytesSent: number | null) => Promise<void>;
  }
): Promise<ResumeQueryResult | { kind: "handoff" }> {
  const io = { ...defaultYoutubeIo(), ...opts.io };
  let last: ResumeQueryResult = { kind: "unknown" };
  for (let attempt = 0; attempt < YOUTUBE_IN_TICK_TRIES; attempt++) {
    last = await queryResumeOffset(uploadUri, access, total, io, opts.deadline);
    if (last.kind !== "unknown") return last;
    if (attempt >= YOUTUBE_IN_TICK_TRIES - 1) break;
    const delay = youtubeRetryDelayMs(attempt, io.random);
    if (!canRetryInTick(io.now(), opts.deadline, delay)) return { kind: "handoff" };
    if (opts.onRetry) {
      await opts.onRetry("Retrying YouTube resume query", `YouTube resume query was busy (try ${attempt + 1}).`, null);
    }
    await io.sleep(delay);
  }
  return { kind: "handoff" };
}

type PutChunkResult =
  | { kind: "complete"; videoId: string }
  | { kind: "continue"; sent: number }
  | { kind: "need_probe" }
  | { kind: "session_gone" }
  | { kind: "auth"; message: string; status: number }
  | { kind: "transient"; message: string; status?: number }
  | { kind: "failed"; message: string };

async function readStorageChunk(
  signedUrl: string,
  range: { start: number; end: number },
  io: YoutubeIo,
  deadline: number
): Promise<Response> {
  let chunk: Response;
  try {
    chunk = await io.fetch(signedUrl, {
      headers: { Range: `bytes=${range.start}-${range.end}` },
      signal: abortSignalForDeadline(io.now(), deadline),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't read film bytes.";
    throw new YoutubeTransientError(message);
  }
  if (!chunk.ok && chunk.status !== 206) {
    if (chunk.status === 404) {
      const err = new Error("Object not found");
      err.name = "FilmStorageError";
      (err as Error & { code: string }).code = "missing";
      throw err;
    }
    throw new YoutubeTransientError(`Couldn't read film bytes (${chunk.status}).`, chunk.status);
  }
  const expected = range.end - range.start + 1;
  if (chunk.status === 200) {
    const len = Number(chunk.headers.get("content-length"));
    if (Number.isFinite(len) && len !== expected) {
      throw new YoutubeTransientError("Storage ignored the byte range.");
    }
  }
  if (!chunk.body) throw new YoutubeTransientError("Storage returned no body.");
  return chunk;
}

async function putResumableChunk(input: {
  uploadUri: string;
  access: string;
  signedUrl: string;
  range: { start: number; end: number };
  total: number;
  contentType: string;
  deadline: number;
  io: YoutubeIo;
}): Promise<PutChunkResult> {
  if (input.io.now() >= input.deadline) {
    return { kind: "transient", message: "Tick budget elapsed before the next chunk." };
  }
  const chunk = await readStorageChunk(input.signedUrl, input.range, input.io, input.deadline);
  let put: Response;
  try {
    put = await input.io.fetch(input.uploadUri, {
      method: "PUT",
      headers: youtubeChunkHeaders(
        input.access,
        input.range.start,
        input.range.end,
        input.total,
        input.contentType
      ),
      body: chunk.body,
      duplex: "half",
      signal: abortSignalForDeadline(input.io.now(), input.deadline),
    } as RequestInit);
  } catch (err) {
    if (isFilmStorageError(err)) throw err;
    const message = err instanceof Error ? err.message : "YouTube upload failed.";
    return { kind: "transient", message };
  }
  if (put.status === 200 || put.status === 201) {
    const json = (await put.json().catch(() => ({}))) as { id?: string };
    if (!json.id) return { kind: "failed", message: "YouTube finished but didn't return a video id." };
    return { kind: "complete", videoId: json.id };
  }
  if (put.status === 308) {
    const rangeHeader = put.headers.get("range");
    if (!rangeHeader) return { kind: "need_probe" };
    return { kind: "continue", sent: parseResumeRange(rangeHeader) };
  }
  const kind = classifyYoutubeHttpStatus(put.status);
  const errText = await put.text().catch(() => "");
  const message = youtubeStatusMessage(put.status, errText);
  if (kind === "session_gone") return { kind: "session_gone" };
  if (kind === "auth") return { kind: "auth", message, status: put.status };
  if (kind === "transient") return { kind: "transient", message, status: put.status };
  return { kind: "failed", message };
}

function youtubeStatusMessage(status: number, body: string): string {
  if (status === 401) return "YouTube login expired. Connect the channel again in Settings → Film.";
  if (status === 403 && /unverified|verification/i.test(body)) {
    return "Google set the video private until the YouTube API app is verified.";
  }
  if (status === 403) return "YouTube refused the upload (check the connected channel and API quota).";
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return snippet ? `YouTube ${status}: ${snippet}` : `YouTube returned ${status}.`;
}

export async function runResumableUpload(input: {
  uploadUri: string | null;
  bytesSent: number;
  total: number;
  access: string;
  signedUrl: string;
  contentType: string;
  deadline: number;
  chunkBytes: number;
  initiate: () => Promise<string>;
  refreshAccess?: () => Promise<string>;
  io?: Partial<YoutubeIo>;
  onRetry?: (message: string, detail: string | null, bytesSent: number) => Promise<void>;
  onProgress?: (prevSent: number, nextSent: number) => Promise<void>;
}): Promise<RunUploadResult> {
  const io = { ...defaultYoutubeIo(), ...input.io };
  let uri = input.uploadUri;
  let sent = input.bytesSent;
  let access = input.access;
  let transientHandoff = false;
  let refreshed = false;

  const retryEvent = async (message: string, detail: string | null) => {
    if (input.onRetry) await input.onRetry(message, detail, sent);
  };

  const tryRefresh = async (): Promise<boolean> => {
    if (refreshed || !input.refreshAccess) return false;
    refreshed = true;
    access = await input.refreshAccess();
    return true;
  };

  if (uri) {
    const resume = await queryResumeOffsetWithRetry(uri, access, input.total, {
      deadline: input.deadline,
      io,
      onRetry: async (message, detail) => retryEvent(message, detail),
    });
    if (resume.kind === "complete") {
      if (!resume.videoId) {
        return {
          outcome: "failed",
          message: "YouTube finished but didn't return a video id.",
          clearSession: false,
          consumeAttempt: false,
        };
      }
      return { outcome: "done", videoId: resume.videoId, bytesSent: input.total, uploadUri: uri };
    }
    if (resume.kind === "handoff") {
      return { outcome: "continued", bytesSent: sent, uploadUri: uri, transient: true };
    }
    if (resume.kind === "auth") {
      if (resume.status === 401 && (await tryRefresh())) {
        const again = await queryResumeOffsetWithRetry(uri, access, input.total, {
          deadline: input.deadline,
          io,
          onRetry: async (message, detail) => retryEvent(message, detail),
        });
        if (again.kind === "complete" && again.videoId) {
          return { outcome: "done", videoId: again.videoId, bytesSent: input.total, uploadUri: uri };
        }
        if (again.kind === "offset") {
          if (input.onProgress && again.sent !== sent) await input.onProgress(sent, again.sent);
          sent = again.sent;
        } else if (again.kind === "expired") {
          uri = null;
          sent = 0;
        } else if (again.kind === "auth" || again.kind === "handoff" || again.kind === "unknown") {
          return { outcome: "auth", message: youtubeStatusMessage(resume.status, "") };
        }
      } else {
        return { outcome: "auth", message: youtubeStatusMessage(resume.status, "") };
      }
    } else if (resume.kind === "expired") {
      uri = null;
      sent = 0;
    } else if (resume.kind === "offset") {
      if (input.onProgress && resume.sent !== sent) await input.onProgress(sent, resume.sent);
      sent = resume.sent;
    }
  }

  if (!uri) {
    uri = await input.initiate();
    sent = 0;
  }

  while (io.now() + YOUTUBE_CHUNK_RESERVE_MS < input.deadline) {
    const range = nextChunkRange(sent, input.total, input.chunkBytes);
    if (!range) break;

    let lastTransient: string | null = null;
    let recovered = false;
    for (let attempt = 0; attempt < YOUTUBE_IN_TICK_TRIES; attempt++) {
      let put: PutChunkResult;
      try {
        put = await putResumableChunk({
          uploadUri: uri,
          access,
          signedUrl: input.signedUrl,
          range,
          total: input.total,
          contentType: input.contentType,
          deadline: input.deadline,
          io,
        });
      } catch (err) {
        if (isFilmStorageError(err)) throw err;
        if (err instanceof YoutubeTransientError) {
          put = { kind: "transient", message: err.message, status: err.status };
        } else {
          throw err;
        }
      }

      if (put.kind === "complete") {
        return { outcome: "done", videoId: put.videoId, bytesSent: input.total, uploadUri: uri };
      }
      if (put.kind === "continue") {
        if (input.onProgress) await input.onProgress(sent, put.sent);
        sent = put.sent;
        recovered = true;
        break;
      }
      if (put.kind === "need_probe") {
        const probed = await queryResumeOffsetWithRetry(uri, access, input.total, {
          deadline: input.deadline,
          io,
          onRetry: async (message, detail) => retryEvent(message, detail),
        });
        if (probed.kind === "complete") {
          if (!probed.videoId) {
            return {
              outcome: "failed",
              message: "YouTube finished but didn't return a video id.",
              clearSession: false,
              consumeAttempt: false,
            };
          }
          return { outcome: "done", videoId: probed.videoId, bytesSent: input.total, uploadUri: uri };
        }
        if (probed.kind === "offset") {
          if (input.onProgress && probed.sent !== sent) await input.onProgress(sent, probed.sent);
          sent = probed.sent;
          recovered = true;
          break;
        }
        if (probed.kind === "expired") {
          uri = await input.initiate();
          sent = 0;
          recovered = true;
          break;
        }
        if (probed.kind === "auth") {
          return { outcome: "auth", message: youtubeStatusMessage(probed.status, "") };
        }
        if (probed.kind === "handoff") {
          return { outcome: "continued", bytesSent: sent, uploadUri: uri, transient: true };
        }
        sent = 0;
        recovered = true;
        break;
      }
      if (put.kind === "session_gone") {
        uri = await input.initiate();
        sent = 0;
        recovered = true;
        break;
      }
      if (put.kind === "auth") {
        if (put.status === 401 && (await tryRefresh())) {
          await retryEvent("Retrying after YouTube 401", put.message);
          continue;
        }
        return { outcome: "auth", message: put.message };
      }
      if (put.kind === "failed") {
        return { outcome: "failed", message: put.message, clearSession: false, consumeAttempt: put.message.includes("didn't return a video id") ? false : true };
      }

      lastTransient = put.message;
      const resume = await queryResumeOffsetWithRetry(uri, access, input.total, {
        deadline: input.deadline,
        io,
        onRetry: async (message, detail) => retryEvent(message, detail),
      });
      if (resume.kind === "complete") {
        if (!resume.videoId) {
          return {
            outcome: "failed",
            message: "YouTube finished but didn't return a video id.",
            clearSession: false,
            consumeAttempt: false,
          };
        }
        return { outcome: "done", videoId: resume.videoId, bytesSent: input.total, uploadUri: uri };
      }
      if (resume.kind === "expired") {
        uri = await input.initiate();
        sent = 0;
        recovered = true;
        break;
      }
      if (resume.kind === "auth") {
        return { outcome: "auth", message: youtubeStatusMessage(resume.status, "") };
      }
      if (resume.kind === "offset") {
        if (input.onProgress && resume.sent !== sent) await input.onProgress(sent, resume.sent);
        if (resume.sent !== sent) {
          sent = resume.sent;
          await retryEvent(
            `Retrying after YouTube ${put.status ?? "error"}`,
            put.message
          );
          recovered = true;
          break;
        }
      }
      if (resume.kind === "handoff") {
        return { outcome: "continued", bytesSent: sent, uploadUri: uri, transient: true };
      }

      await retryEvent(
        `Retrying after YouTube ${put.status ?? "error"}`,
        put.message
      );
      if (attempt >= YOUTUBE_IN_TICK_TRIES - 1) break;
      const delay = youtubeRetryDelayMs(attempt, io.random);
      if (!canRetryInTick(io.now(), input.deadline, delay)) {
        return { outcome: "continued", bytesSent: sent, uploadUri: uri, transient: true };
      }
      await io.sleep(delay);
    }
    if (recovered) continue;
    if (lastTransient) {
      transientHandoff = true;
      break;
    }
  }

  return { outcome: "continued", bytesSent: sent, uploadUri: uri, transient: transientHandoff };
}

export { youtubeStatusMessage };
