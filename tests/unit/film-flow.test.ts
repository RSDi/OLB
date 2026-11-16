import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { filmFlowView } from "../../lib/film/flow.ts";
import type { FilmUpload } from "../../lib/film/types.ts";

type Row = Parameters<typeof filmFlowView>[0]["row"];

function row(partial: Partial<Row> = {}): Row {
  return {
    status: "holding",
    moved_at: null,
    file_deleted_at: null,
    youtube_status: null,
    youtube_video_id: null,
    youtube_updated_at: null,
    youtube_processing: null,
    youtube_playlist_status: null,
    ...partial,
  } satisfies Partial<FilmUpload>;
}

const states = (v: ReturnType<typeof filmFlowView>) => v.steps.map((s) => `${s.key}:${s.state}`).join(" ");

test("never sent to YouTube needs attention", () => {
  const v = filmFlowView({ row: row(), display: null, playlistId: null });
  assert.equal(states(v), "uploaded:done youtube:todo ready:todo");
  assert.equal(v.badge.text, "Not on YouTube");
  assert.equal(v.needsAttention, true);
  assert.equal(v.originalNote, "Original file kept until YouTube has it.");
});

test("queued is in progress, not attention", () => {
  const v = filmFlowView({ row: row({ youtube_status: "queued" }), display: "queued", playlistId: "PL1234567890" });
  assert.equal(states(v), "uploaded:done youtube:active ready:todo playlist:todo");
  assert.equal(v.badge.text, "In progress");
  assert.equal(v.needsAttention, false);
});

test("failed or stalled needs attention", () => {
  for (const display of ["failed", "stalled"] as const) {
    const v = filmFlowView({ row: row({ youtube_status: display === "failed" ? "failed" : "uploading" }), display, playlistId: null });
    assert.equal(v.badge.text, "Needs attention");
    assert.equal(v.needsAttention, true);
  }
});

test("on YouTube, ready, in playlist is done and shows when the original goes", () => {
  const v = filmFlowView({
    row: row({
      youtube_status: "done",
      youtube_video_id: "abc",
      youtube_processing: "processed",
      youtube_updated_at: "2026-11-01T18:00:00Z",
      youtube_playlist_status: "done",
    }),
    display: "done",
    playlistId: "PL1234567890",
  });
  assert.equal(states(v), "uploaded:done youtube:done ready:done playlist:done");
  assert.equal(v.badge.text, "Done");
  assert.equal(v.needsAttention, false);
  assert.equal(v.originalNote, "Original file kept until Dec 1.");
});

test("on YouTube but missing from the playlist needs attention", () => {
  const v = filmFlowView({
    row: row({ youtube_status: "done", youtube_video_id: "abc", youtube_processing: "processed" }),
    display: "done",
    playlistId: "PL1234567890",
  });
  assert.equal(v.badge.text, "Needs attention");
});

test("still processing on YouTube is in progress", () => {
  const v = filmFlowView({
    row: row({ youtube_status: "done", youtube_video_id: "abc", youtube_processing: "uploaded" }),
    display: "done",
    playlistId: null,
  });
  assert.equal(states(v), "uploaded:done youtube:done ready:active");
  assert.equal(v.badge.text, "In progress");
  assert.equal(v.originalNote, "Original file kept until YouTube has it.");
});

test("missing game details needs attention without a problem badge", () => {
  const v = filmFlowView({
    row: row({ youtube_status: "done", youtube_video_id: "abc", youtube_processing: "processed" }),
    display: "done",
    playlistId: null,
    missingDetails: true,
  });
  assert.equal(v.badge.text, "Done");
  assert.equal(v.needsAttention, true);
});

test("original removed", () => {
  const v = filmFlowView({
    row: row({ youtube_status: "done", youtube_video_id: "abc", youtube_processing: "processed", file_deleted_at: "2026-12-01T00:00:00Z" }),
    display: "done",
    playlistId: null,
  });
  assert.equal(v.originalGone, true);
  assert.equal(v.originalNote, "Original file removed after YouTube had it.");
});

test("cleanup deletes originals YouTube has had, keeps the row", () => {
  const src = readFileSync(join(process.cwd(), "lib/film/cleanup.ts"), "utf8");
  assert.ok(src.includes("listExpiredYoutubeOriginals"));
  assert.ok(src.includes("markFilmOriginalDeleted"));
  const q = readFileSync(join(process.cwd(), "lib/film/uploads.ts"), "utf8");
  assert.ok(q.includes('.eq("youtube_processing", "processed")'));
  assert.ok(q.includes('.is("file_deleted_at", null)'));
});

test("the cron queues uploads that never went to YouTube", () => {
  const src = readFileSync(join(process.cwd(), "app/api/cron/film-youtube/route.ts"), "utf8");
  assert.ok(src.includes("enqueueUnsentUploads()"));
});

test("migration adds file_deleted_at", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0170_film_original_deleted.sql"), "utf8");
  assert.ok(sql.includes("add column if not exists file_deleted_at timestamptz"));
});
