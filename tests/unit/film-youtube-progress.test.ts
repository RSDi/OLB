import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  crossedMilestones,
  formatEta,
  isYoutubeStalled,
  mapYoutubeError,
  progressPercent,
  youtubeDisplayStatus,
  youtubeEtaMs,
  youtubeProgressLine,
  youtubeProgressView,
  youtubeWorkLabel,
  YOUTUBE_STALL_MS,
} from "../../lib/film/youtube-progress.ts";

test("stalled is uploading with no progress for 30 minutes", () => {
  const now = Date.parse("2026-10-18T22:00:00Z");
  assert.equal(
    isYoutubeStalled({
      youtubeStatus: "uploading",
      lastProgressAt: "2026-10-18T21:29:00Z",
      now,
    }),
    true
  );
  assert.equal(
    isYoutubeStalled({
      youtubeStatus: "uploading",
      lastProgressAt: "2026-10-18T21:31:00Z",
      now,
    }),
    false
  );
  assert.equal(
    isYoutubeStalled({
      youtubeStatus: "queued",
      lastProgressAt: "2026-10-17T00:00:00Z",
      now,
    }),
    false
  );
  assert.equal(YOUTUBE_STALL_MS, 30 * 60 * 1000);
  assert.equal(
    youtubeDisplayStatus({
      youtubeStatus: "uploading",
      lastProgressAt: "2026-10-18T21:00:00Z",
      now,
    }),
    "stalled"
  );
  assert.equal(youtubeWorkLabel("stalled"), "Stalled");
});

test("progress line has percent, bytes, ETA, and started time", () => {
  const now = Date.parse("2026-10-18T20:20:00Z");
  const view = youtubeProgressView({
    bytesSent: 2 * 1024 * 1024 * 1024,
    bytesTotal: 4 * 1024 * 1024 * 1024,
    startedAt: "2026-10-18T20:00:00Z",
    now,
  });
  assert.ok(view);
  assert.equal(view.percent, 50);
  const line = youtubeProgressLine(view, now);
  assert.match(line, /50%/);
  assert.match(line, /of/);
  assert.match(line, /started/);
  assert.match(line, /min left|hr left|less than a minute/);
  assert.equal(progressPercent(0, 100), 0);
  assert.equal(progressPercent(100, 100), 100);
  assert.deepEqual(crossedMilestones(0, 50_000_000, 100_000_000), [10, 25, 50]);
  assert.deepEqual(crossedMilestones(40_000_000, 49_000_000, 100_000_000), []);
  assert.equal(formatEta(45_000), "less than a minute left");
  assert.equal(formatEta(12 * 60_000), "about 12 min left");
  const eta = youtubeEtaMs({
    bytesSent: 1_000,
    bytesTotal: 2_000,
    startedAt: "2026-10-18T20:00:00Z",
    now,
  });
  assert.ok(eta != null && eta > 0);
});

test("Object not found maps to a re-upload message and keeps the raw error", () => {
  const mapped = mapYoutubeError("Object not found");
  assert.ok(mapped);
  assert.equal(mapped.known, true);
  assert.match(mapped.message, /isn't in storage/);
  assert.match(mapped.message, /re-upload/);
  assert.equal(mapped.raw, "Object not found");
  const session = mapYoutubeError("YouTube upload session expired.");
  assert.ok(session?.known);
  assert.match(session.message, /Retry YouTube/);
  const unknown = mapYoutubeError("YouTube 500: backend exploded");
  assert.ok(unknown);
  assert.equal(unknown.known, false);
  assert.equal(unknown.message, "YouTube 500: backend exploded");
});

test("worker verifies storage, restarts a dead session, and records events", () => {
  const worker = readFileSync(join(import.meta.dirname, "../../lib/film/youtube.ts"), "utf8");
  const complete = readFileSync(join(import.meta.dirname, "../../app/film/complete/route.ts"), "utf8");
  const inbox = readFileSync(join(import.meta.dirname, "../../app/portal/film/FilmInbox.tsx"), "utf8");
  const board = readFileSync(join(import.meta.dirname, "../../app/portal/film/status/FilmStatusBoard.tsx"), "utf8");
  const transfer = readFileSync(join(import.meta.dirname, "../../app/portal/film/YoutubeTransfer.tsx"), "utf8");
  assert.match(worker, /requireFilmObject/);
  assert.match(worker, /FilmStorageError/);
  assert.match(worker, /expired: true/);
  assert.match(worker, /upload session expired/);
  assert.match(worker, /noteYoutubeEvent/);
  assert.match(worker, /markStalledUploads/);
  assert.match(worker, /code === "not_ready"/);
  assert.doesNotMatch(worker, /if \(res\.status === 404\) return \{ sent: 0 \}/);
  assert.match(complete, /waitForFilmObject/);
  assert.match(complete, /kind: "received"/);
  assert.match(inbox, /Film status/);
  assert.match(inbox, /YoutubeTransfer/);
  assert.match(inbox, /Retry YouTube/);
  assert.match(inbox, /display === "stalled"/);
  assert.match(board, /Needs attention/);
  assert.match(board, /Stalled/);
  assert.match(board, /Retry YouTube/);
  assert.match(transfer, />History</);
  assert.match(transfer, />Details</);
  assert.match(transfer, /youtubeProgressLine/);
  assert.match(transfer, /mapYoutubeError/);
});
