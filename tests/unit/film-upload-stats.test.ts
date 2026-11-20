import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  averageMbps,
  currentMbps,
  formatTimeLeft,
  formatUploadStats,
  newSpeedMeter,
  recordProgress,
  secondsLeft,
  uploadStatsRow,
  videoSizeAdvice,
} from "../../lib/film/upload-stats.ts";

const MB = 1_000_000;

test("speed meter: 10 Mbps steady gives speed and time left", () => {
  const m = newSpeedMeter();
  // 1.25 MB per second = 10 Mbps, one sample a second for 30 s
  for (let s = 0; s <= 30; s++) recordProgress(m, s * 1.25 * MB, s * 1000);
  assert.ok(Math.abs((currentMbps(m) ?? 0) - 10) < 0.01);
  const total = 100 * 1.25 * MB; // 100 s of upload in all, 30 done
  assert.ok(Math.abs((secondsLeft(m, total) ?? 0) - 70) < 0.5);
  assert.ok(Math.abs((averageMbps(m) ?? 0) - 10) < 0.01);
  assert.equal(m.activeMs, 30_000);
});

test("speed meter: no guess in the first few seconds", () => {
  const m = newSpeedMeter();
  recordProgress(m, 0, 0);
  recordProgress(m, MB, 2000);
  assert.equal(currentMbps(m), null);
  assert.equal(secondsLeft(m, 10 * MB), null);
});

test("speed meter: a locked-phone gap isn't counted as slow uploading", () => {
  const m = newSpeedMeter();
  for (let s = 0; s <= 10; s++) recordProgress(m, s * MB, s * 1000);
  // phone locked for 10 minutes, then carries on at the same speed
  const back = 10_000 + 600_000;
  for (let s = 0; s <= 10; s++) recordProgress(m, (11 + s) * MB, back + s * 1000);
  assert.equal(m.activeMs, 20_000);
  assert.ok(Math.abs((averageMbps(m) ?? 0) - 8) < 0.5);
});

test("time left reads in plain words", () => {
  assert.equal(formatTimeLeft(20), "Less than a minute left");
  assert.equal(formatTimeLeft(25 * 60), "About 25 min left");
  assert.equal(formatTimeLeft(70 * 60), "About 1 hr 10 min left");
  assert.equal(formatTimeLeft(120 * 60), "About 2 hr left");
});

test("videoSizeAdvice flags 4K and 60 fps, leaves 1080p/30 alone", () => {
  const min90 = 90 * 60;
  // 4K30 HEVC ≈ 24 Mbps
  const fourK = videoSizeAdvice({ width: 3840, height: 2160, durationSeconds: min90 }, (24 * MB * min90) / 8);
  assert.equal(fourK.kind, "4k");
  assert.equal(fourK.times, 3);
  assert.match(fourK.message ?? "", /This video is 4K/);
  assert.match(fourK.message ?? "", /1080p at 30 fps/);
  // portrait 4K, length unknown
  assert.equal(videoSizeAdvice({ width: 2160, height: 3840, durationSeconds: 0 }, 5e9).kind, "4k");
  // 1080p60 ≈ 17 Mbps
  const sixty = videoSizeAdvice({ width: 1920, height: 1080, durationSeconds: min90 }, (17 * MB * min90) / 8);
  assert.equal(sixty.kind, "high");
  assert.match(sixty.message ?? "", /60 fps/);
  // 1080p30 ≈ 8 Mbps
  assert.equal(videoSizeAdvice({ width: 1920, height: 1080, durationSeconds: min90 }, (8 * MB * min90) / 8).message, null);
  assert.equal(videoSizeAdvice(null, 5e9).message, null);
});

test("uploadStatsRow clamps what the phone sent", () => {
  const row = uploadStatsRow({
    activeSeconds: 3660,
    sentBytes: 6.4e9,
    resumed: false,
    videoWidth: 3840,
    videoHeight: 2160,
    videoDurationSeconds: 5400.4,
  });
  assert.deepEqual(row, {
    upload_seconds: 3660,
    upload_mbps: 13.99,
    video_width: 3840,
    video_height: 2160,
    video_duration_s: 5400,
  });
  assert.equal(uploadStatsRow({ activeSeconds: 600, sentBytes: 1e9, resumed: true }).upload_seconds, null);
  assert.deepEqual(uploadStatsRow({ activeSeconds: "x", sentBytes: -4, videoWidth: 1e9 }), {
    upload_seconds: null,
    upload_mbps: null,
    video_width: null,
    video_height: null,
    video_duration_s: null,
  });
  assert.equal(uploadStatsRow(undefined).upload_mbps, null);
});

test("formatUploadStats gives coaches one line", () => {
  assert.equal(
    formatUploadStats({ upload_seconds: 3660, upload_mbps: 13.99, video_width: 3840, video_height: 2160 }),
    "4K · uploaded in 1 hr 1 min at 14 Mbps"
  );
  assert.equal(formatUploadStats({ upload_mbps: 22, video_width: 1080, video_height: 1920 }), "1080p · uploaded at 22 Mbps");
  assert.equal(formatUploadStats({}), null);
});

test("0176 adds the upload stats columns", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0176_film_upload_stats.sql"), "utf8");
  for (const col of ["upload_seconds", "upload_mbps", "video_width", "video_height", "video_duration_s"]) {
    assert.ok(sql.includes(col), col);
  }
});
