import { test } from "node:test";
import assert from "node:assert/strict";
import { YOUTUBE_CHUNK_ALIGN, YOUTUBE_CHUNK_BYTES, youtubeChunkBytes } from "../../lib/film/youtube-meta.ts";
import {
  YOUTUBE_MAX_TRANSIENT_ATTEMPTS,
  YOUTUBE_RETRY_RESERVE_MS,
  YOUTUBE_STALE_MS,
  applyYoutubeLeaseAcquire,
  applyYoutubeLeaseRelease,
  canClaimYoutubeJob,
  canRetryInTick,
  classifyYoutubeFailure,
  interpretResumeResponse,
  isMissingYoutubeJobExtraColumn,
  isTransientNetworkError,
  isYoutubeResumeProbe,
  planYoutubeFailOrRequeue,
  queryResumeOffset,
  runResumableUpload,
  youtubeManualRetryPatch,
  youtubeRetryDelayMs,
  YoutubeAuthError,
  YoutubeSessionGoneError,
  YoutubeTransientError,
} from "../../lib/film/youtube-resume.ts";

const CHUNK = YOUTUBE_CHUNK_ALIGN;
const TOTAL = CHUNK * 2;
const ACCESS = "test-access";
const STORAGE = "https://storage.example/film";
const SESSION = "https://youtube.example/upload/session";
const NEW_SESSION = "https://youtube.example/upload/new";

function header(init: RequestInit | undefined, name: string): string | null {
  const headers = init?.headers;
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

function storageRes(): Response {
  return new Response(new Uint8Array(CHUNK), {
    status: 206,
    headers: { "Content-Range": `bytes 0-${CHUNK - 1}/${TOTAL}` },
  });
}

function youtubeRes(status: number, headers?: Record<string, string>, body?: unknown): Response {
  const json = body === undefined ? null : JSON.stringify(body);
  return new Response(json, { status, headers: headers ?? {} });
}

function makeIo(onYoutube: (info: {
  url: string;
  probe: boolean;
  range: string | null;
}) => Response | Error) {
  const sleeps: number[] = [];
  let now = 1_000_000;
  const io = {
    now: () => now,
    random: () => 1, // delay = 100% of base
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    fetch: async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      if (href.startsWith(STORAGE)) {
        assert.ok(init?.signal, "storage reads must carry an AbortSignal");
        return storageRes();
      }
      if (href.startsWith("https://youtube.example/")) {
        const probe = isYoutubeResumeProbe(init);
        if (!probe) {
          assert.ok(init?.signal, "chunk PUTs must carry an AbortSignal");
        }
        if (!probe) {
          assert.equal((init as RequestInit & { duplex?: string })?.duplex, "half");
          assert.ok(init?.body);
          assert.equal(Buffer.isBuffer(init.body), false);
        }
        const result = onYoutube({
          url: href,
          probe,
          range: header(init, "Content-Range"),
        });
        if (result instanceof Error) throw result;
        return result;
      }
      throw new Error(`unexpected fetch ${href}`);
    },
  };
  return { io, sleeps, advance: (ms: number) => { now += ms; } };
}

test("chunk size is a multiple of 256 KiB and defaults to 64 MiB", () => {
  assert.equal(YOUTUBE_CHUNK_BYTES % YOUTUBE_CHUNK_ALIGN, 0);
  assert.equal(YOUTUBE_CHUNK_BYTES, 64 * 1024 * 1024);
  assert.equal(youtubeChunkBytes({ FILM_YOUTUBE_CHUNK_BYTES: String(3 * YOUTUBE_CHUNK_ALIGN) }), 3 * YOUTUBE_CHUNK_ALIGN);
  assert.equal(youtubeChunkBytes({ FILM_YOUTUBE_CHUNK_BYTES: "1000" }) % YOUTUBE_CHUNK_ALIGN, 0);
});

test("mid-upload 503 resumes from the YouTube Range offset", async () => {
  const puts: string[] = [];
  const retries: string[] = [];
  let initiated = 0;
  const { io } = makeIo(({ probe, range }) => {
    if (probe) {
      if (puts.length === 0) return youtubeRes(308);
      return youtubeRes(308, { range: `bytes=0-${CHUNK - 1}` });
    }
    puts.push(range ?? "");
    if (puts.length === 1) return youtubeRes(503, {}, { error: "backend" });
    return youtubeRes(200, {}, { id: "vid503" });
  });

  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: 0,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    initiate: async () => {
      initiated += 1;
      return NEW_SESSION;
    },
    io,
    onRetry: async (message) => {
      retries.push(message);
    },
  });

  assert.equal(result.outcome, "done");
  if (result.outcome === "done") assert.equal(result.videoId, "vid503");
  assert.equal(initiated, 0);
  assert.equal(result.uploadUri, SESSION);
  assert.equal(puts[0], `bytes 0-${CHUNK - 1}/${TOTAL}`);
  assert.equal(puts[1], `bytes ${CHUNK}-${TOTAL - 1}/${TOTAL}`);
  assert.ok(retries.some((m) => /503/.test(m)));
  assert.ok(!retries.join(" ").includes(ACCESS));
});

test("network error mid-upload resumes from the YouTube Range offset", async () => {
  const puts: string[] = [];
  let initiated = 0;
  const { io } = makeIo(({ probe, range }) => {
    if (probe) {
      if (puts.length === 0) return youtubeRes(308);
      return youtubeRes(308, { range: `bytes=0-${CHUNK - 1}` });
    }
    puts.push(range ?? "");
    if (puts.length === 1) return new TypeError("fetch failed");
    return youtubeRes(200, {}, { id: "vidnet" });
  });

  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: 0,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    initiate: async () => {
      initiated += 1;
      return NEW_SESSION;
    },
    io,
  });

  assert.equal(result.outcome, "done");
  if (result.outcome === "done") assert.equal(result.videoId, "vidnet");
  assert.equal(initiated, 0);
  assert.equal(puts[1], `bytes ${CHUNK}-${TOTAL - 1}/${TOTAL}`);
});

test("404 and 410 on the session start a new session", async () => {
  for (const status of [404, 410]) {
    let initiated = 0;
    const { io } = makeIo(({ url, probe }) => {
      if (url === SESSION) {
        if (probe) return youtubeRes(308);
        return youtubeRes(status);
      }
      if (probe) return youtubeRes(308);
      return youtubeRes(200, {}, { id: `vid${status}` });
    });

    const result = await runResumableUpload({
      uploadUri: SESSION,
      bytesSent: CHUNK,
      total: TOTAL,
      access: ACCESS,
      signedUrl: STORAGE,
      contentType: "video/mp4",
      deadline: 1_000_000 + 120_000,
      chunkBytes: CHUNK,
      initiate: async () => {
        initiated += 1;
        return NEW_SESSION;
      },
      io,
    });

    assert.equal(result.outcome, "done", `status ${status}`);
    assert.equal(initiated, 1, `status ${status}`);
    if (result.outcome === "done") {
      assert.equal(result.videoId, `vid${status}`);
      assert.equal(result.uploadUri, NEW_SESSION);
    }
  }
});

test("backoff stays within the tick budget and hands off instead of failing", async () => {
  const { io, sleeps } = makeIo(({ probe }) => {
    if (probe) return youtubeRes(503);
    return youtubeRes(503);
  });
  const deadline = 1_000_000 + 5_000;
  const delay = youtubeRetryDelayMs(2, () => 1);
  assert.equal(canRetryInTick(1_000_000, deadline, delay), false);
  assert.ok(delay + YOUTUBE_RETRY_RESERVE_MS > 5_000);

  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: 0,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline,
    chunkBytes: CHUNK,
    initiate: async () => SESSION,
    io,
  });

  assert.equal(result.outcome, "continued");
  if (result.outcome === "continued") {
    assert.equal(result.transient, true);
    assert.equal(result.uploadUri, SESSION);
  }
  assert.ok(sleeps.every((ms) => 1_000_000 + ms + YOUTUBE_RETRY_RESERVE_MS <= deadline));
});

test("lease claiming skips a held lease and a future next_attempt_at", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(canClaimYoutubeJob({ youtubeStatus: "queued", now }), true);
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "uploading",
      claimedUntil: "2026-10-22T12:04:00Z",
      now,
    }),
    false
  );
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "uploading",
      claimedUntil: "2026-10-22T11:59:00Z",
      now,
    }),
    true
  );
  assert.equal(canClaimYoutubeJob({ youtubeStatus: "uploading", claimedUntil: null, now }), true);
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "queued",
      nextAttemptAt: "2026-10-22T12:01:00Z",
      now,
    }),
    false
  );
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "queued",
      nextAttemptAt: "2026-10-22T11:59:00Z",
      now,
    }),
    true
  );
  assert.equal(canClaimYoutubeJob({ youtubeStatus: "failed", now }), false);
});

test("queryResumeOffset treats 5xx as unknown and 404/410 as expired", async () => {
  const five = await queryResumeOffset(SESSION, ACCESS, TOTAL, {
    ...makeIo(() => youtubeRes(503)).io,
  });
  assert.equal(five.kind, "unknown");
  const gone = await queryResumeOffset(SESSION, ACCESS, TOTAL, {
    ...makeIo(() => youtubeRes(410)).io,
  });
  assert.equal(gone.kind, "expired");
  const offset = await queryResumeOffset(SESSION, ACCESS, TOTAL, {
    ...makeIo(() => youtubeRes(308, { range: "bytes=0-1023" })).io,
  });
  assert.deepEqual(offset, { kind: "offset", sent: 1024 });
  assert.equal(interpretResumeResponse(500, null).kind, "unknown");
  assert.equal(interpretResumeResponse(429, null).kind, "unknown");
});

test("manual retry keeps a live session and restarts only when it is gone", () => {
  const keep = youtubeManualRetryPatch(
    {
      upload_uri: SESSION,
      bytes_sent: 9,
      bytes_total: 20,
      attempts: 2,
      started_at: "2026-10-22T00:00:00Z",
      last_progress_at: "2026-10-22T00:01:00Z",
    },
    20
  );
  assert.equal(keep.upload_uri, SESSION);
  assert.equal(keep.bytes_sent, 9);
  assert.equal(keep.next_attempt_at, null);
  const restart = youtubeManualRetryPatch({ upload_uri: null, bytes_sent: 9, bytes_total: 20, attempts: 1, started_at: null, last_progress_at: null }, 20);
  assert.equal(restart.upload_uri, null);
  assert.equal(restart.bytes_sent, 0);
});

test("transient errors do not consume attempts or clear the session", () => {
  const transient = classifyYoutubeFailure(new YoutubeTransientError("YouTube 503: backend", 503));
  assert.equal(transient.kind, "transient");
  assert.equal(transient.clearSession, false);
  assert.equal(transient.consumeAttempt, false);
  const network = classifyYoutubeFailure(new TypeError("fetch failed"));
  assert.equal(network.kind, "transient");
  assert.equal(network.clearSession, false);
  const storage = classifyYoutubeFailure(new YoutubeTransientError("Couldn't read film bytes (503).", 503));
  assert.equal(storage.kind, "transient");
  assert.equal(storage.clearSession, false);
  assert.equal(storage.consumeAttempt, false);
  const gone = classifyYoutubeFailure(new YoutubeSessionGoneError());
  assert.equal(gone.kind, "session_gone");
  assert.equal(gone.clearSession, true);
  assert.equal(gone.consumeAttempt, true);
});

test("job extra-column errors are recognized so the worker can fail closed before 0159", () => {
  assert.equal(
    isMissingYoutubeJobExtraColumn("Could not find the 'next_attempt_at' column of 'game_film_youtube_jobs' in the schema cache"),
    true
  );
  assert.equal(isMissingYoutubeJobExtraColumn("column claimed_until does not exist"), true);
  assert.equal(isMissingYoutubeJobExtraColumn("column claimed_by does not exist"), true);
  assert.equal(isMissingYoutubeJobExtraColumn("column bytes_sent does not exist"), false);
});

test("308 with no Range does not skip a chunk", async () => {
  const puts: string[] = [];
  let initiated = 0;
  const { io } = makeIo(({ probe, range }) => {
    if (probe) return youtubeRes(308);
    puts.push(range ?? "");
    if (puts.length === 1) return youtubeRes(308);
    return youtubeRes(200, {}, { id: "vid308" });
  });

  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: 0,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    initiate: async () => {
      initiated += 1;
      return NEW_SESSION;
    },
    io,
  });

  assert.equal(result.outcome, "done");
  assert.equal(initiated, 0);
  assert.equal(puts[0], `bytes 0-${CHUNK - 1}/${TOTAL}`);
  assert.equal(puts[1], `bytes 0-${CHUNK - 1}/${TOTAL}`);
  assert.notEqual(puts[1], `bytes ${CHUNK}-${TOTAL - 1}/${TOTAL}`);
});

test("401 refreshes auth and keeps the session; 403 keeps the session and does not initiate", async () => {
  let refreshed = 0;
  let initiated = 0;
  const puts: string[] = [];
  const { io } = makeIo(({ probe, range }) => {
    if (probe) return youtubeRes(308);
    puts.push(range ?? "");
    if (puts.length === 1) return youtubeRes(401);
    return youtubeRes(200, {}, { id: "vid401" });
  });

  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: 0,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    refreshAccess: async () => {
      refreshed += 1;
      return "test-access-refreshed";
    },
    initiate: async () => {
      initiated += 1;
      return NEW_SESSION;
    },
    io,
  });

  assert.equal(result.outcome, "done");
  if (result.outcome === "done") {
    assert.equal(result.videoId, "vid401");
    assert.equal(result.uploadUri, SESSION);
  }
  assert.equal(refreshed, 1);
  assert.equal(initiated, 0);

  const forbidden = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: CHUNK,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    initiate: async () => {
      initiated += 1;
      return NEW_SESSION;
    },
    io: makeIo(({ probe }) => (probe ? youtubeRes(308) : youtubeRes(403))).io,
  });
  assert.equal(forbidden.outcome, "auth");
  assert.equal(initiated, 0);
  const authClass = classifyYoutubeFailure(new YoutubeAuthError("YouTube 403: quota"));
  assert.equal(authClass.clearSession, false);
  assert.equal(authClass.consumeAttempt, true);
  assert.equal(interpretResumeResponse(401, null).kind, "auth");
  assert.equal(interpretResumeResponse(403, null).kind, "auth");
  assert.equal(interpretResumeResponse(410, null).kind, "expired");
});

test("without 0159 columns, uploading uses the 4-minute stale gate", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "uploading",
      extrasAvailable: false,
      youtubeUpdatedAt: "2026-10-22T11:59:00Z",
      now,
    }),
    false
  );
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "uploading",
      extrasAvailable: false,
      youtubeUpdatedAt: new Date(now - YOUTUBE_STALE_MS - 1).toISOString(),
      now,
    }),
    true
  );
  assert.equal(
    canClaimYoutubeJob({
      youtubeStatus: "queued",
      extrasAvailable: false,
      now,
    }),
    true
  );
});

test("lease acquire is exclusive and release requires the owner", () => {
  const rows = new Map();
  const now = Date.parse("2026-10-22T12:00:00Z");
  const until = "2026-10-22T12:05:00Z";
  assert.equal(applyYoutubeLeaseAcquire(rows, "u1", now, until, "owner-a"), true);
  assert.equal(applyYoutubeLeaseAcquire(rows, "u1", now, until, "owner-b"), false);
  assert.equal(applyYoutubeLeaseRelease(rows, "u1", "owner-b"), false);
  assert.equal(rows.get("u1")?.claimedBy, "owner-a");
  assert.equal(applyYoutubeLeaseRelease(rows, "u1", "owner-a"), true);
  assert.equal(rows.get("u1")?.claimedBy, null);
  assert.equal(applyYoutubeLeaseAcquire(rows, "u1", now, until, "owner-b"), true);
});

test("failOrRequeue transient path keeps the session and caps retries", () => {
  const job = {
    upload_uri: SESSION,
    bytes_sent: 100,
    bytes_total: 200,
    attempts: 1,
    last_progress_at: "2026-10-22T11:00:00Z",
    transient_attempts: 0,
  };
  const plan = planYoutubeFailOrRequeue(new YoutubeTransientError("YouTube 503: backend", 503), job);
  assert.equal(plan.jobPatch.upload_uri, SESSION);
  assert.equal(plan.jobPatch.bytes_sent, 100);
  assert.equal(plan.jobPatch.transient_attempts, 1);
  assert.ok(plan.jobPatch.next_attempt_at);
  assert.equal(plan.youtubeStatus, "uploading");
  assert.equal(plan.event?.kind, "retry");

  const capped = planYoutubeFailOrRequeue(
    new YoutubeTransientError("YouTube 503: backend", 503),
    { ...job, transient_attempts: YOUTUBE_MAX_TRANSIENT_ATTEMPTS }
  );
  assert.equal(capped.jobPatch.upload_uri, SESSION);
  assert.equal(capped.jobPatch.bytes_sent, 100);
  assert.equal(capped.youtubeStatus, "queued");
  assert.equal(capped.jobPatch.attempts, 2);

  const auth = planYoutubeFailOrRequeue(new YoutubeAuthError("YouTube refused the upload."), job);
  assert.equal(auth.jobPatch.upload_uri, SESSION);
  assert.equal(auth.jobPatch.bytes_sent, 100);
  assert.equal(auth.youtubeStatus, "queued");

  const emptyId = planYoutubeFailOrRequeue(new Error("YouTube finished but didn't return a video id."), job);
  assert.equal(emptyId.jobPatch.upload_uri, SESSION);
  assert.equal(emptyId.jobPatch.bytes_sent, 100);
  assert.equal(emptyId.jobPatch.attempts, 1);
  assert.equal(emptyId.youtubeStatus, "failed");
});

test("only real network TypeErrors are transient", () => {
  assert.equal(isTransientNetworkError(new TypeError("fetch failed")), true);
  assert.equal(isTransientNetworkError(new TypeError("Cannot read properties of undefined")), false);
  assert.equal(classifyYoutubeFailure(new TypeError("Cannot read properties of undefined")).kind, "fatal");
  assert.equal(classifyYoutubeFailure(new TypeError("fetch failed")).kind, "transient");
});

test("probe 200 without a video id does not count as done", async () => {
  const { io } = makeIo(() => youtubeRes(200, {}, {}));
  const result = await runResumableUpload({
    uploadUri: SESSION,
    bytesSent: TOTAL,
    total: TOTAL,
    access: ACCESS,
    signedUrl: STORAGE,
    contentType: "video/mp4",
    deadline: 1_000_000 + 120_000,
    chunkBytes: CHUNK,
    initiate: async () => NEW_SESSION,
    io,
  });
  assert.equal(result.outcome, "failed");
  if (result.outcome === "failed") {
    assert.equal(result.clearSession, false);
    assert.equal(result.consumeAttempt, false);
  }
});
