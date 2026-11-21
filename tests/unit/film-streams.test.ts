import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findStreamToReplace,
  parseYoutubeVideoId,
  sameOpponent,
  shiftStreamMarkers,
} from "../../lib/film/streams.ts";
import { toWatchGames, watchStreamSwaps } from "../../lib/film/watch.ts";
import { filmFlowView } from "../../lib/film/flow.ts";
import type { FilmUpload } from "../../lib/film/types.ts";

function row(partial: Partial<FilmUpload> & Pick<FilmUpload, "id">): FilmUpload {
  return {
    team: "14u-white",
    team_id: "t1",
    uploader_name: "Pat",
    filename: "game.mov",
    content_type: "video/quicktime",
    size_bytes: 10,
    storage_path: `p/${partial.id}`,
    status: "holding",
    created_at: "2026-11-22T15:00:00Z",
    moved_at: null,
    file_deleted_at: null,
    game_date: "2026-11-22",
    opponent: "Iowa Elite",
    our_score: 48,
    their_score: 41,
    event_name: null,
    youtube_status: null,
    youtube_video_id: null,
    youtube_error: null,
    youtube_updated_at: null,
    youtube_playlist_id: null,
    youtube_playlist_status: null,
    youtube_playlist_error: null,
    youtube_playlist_item_id: null,
    youtube_playlist_updated_at: null,
    youtube_privacy: "unlisted",
    youtube_processing: "processed",
    youtube_synced_at: null,
    streamed: false,
    replaces_stream_id: null,
    ...partial,
  };
}

const stream = (partial: Partial<FilmUpload> = {}) =>
  row({
    id: "s1",
    filename: "Livestream",
    streamed: true,
    file_deleted_at: "2026-11-22T15:00:00Z",
    youtube_status: "done",
    youtube_video_id: "q8Rk2mXv7Jc",
    ...partial,
  });

test("a stream's video id comes out of any YouTube link", () => {
  for (const link of [
    "https://youtube.com/live/q8Rk2mXv7Jc?feature=share",
    "https://www.youtube.com/watch?v=q8Rk2mXv7Jc&t=30",
    "youtu.be/q8Rk2mXv7Jc",
    "https://m.youtube.com/watch?v=q8Rk2mXv7Jc",
    "https://www.youtube.com/embed/q8Rk2mXv7Jc",
    "https://studio.youtube.com/video/q8Rk2mXv7Jc/livestreaming",
    "q8Rk2mXv7Jc",
  ]) {
    assert.equal(parseYoutubeVideoId(link), "q8Rk2mXv7Jc", link);
  }
  for (const bad of ["", "hello", "https://vimeo.com/123456789", "https://youtube.com/@omahalightning", 42]) {
    assert.equal(parseYoutubeVideoId(bad), null, String(bad));
  }
});

test("opponents match ignoring case, spaces and punctuation", () => {
  assert.ok(sameOpponent("Iowa Elite", "iowa  elite."));
  assert.ok(!sameOpponent("Iowa Elite", "Iowa Elite 2"));
  assert.ok(!sameOpponent(null, null));
});

test("a recording finds its stream by team, day and opponent", () => {
  const streams = [stream(), stream({ id: "s2", opponent: "Lincoln Thunder" })];
  const rec = { teamId: "t1", gameDate: "2026-11-22", opponent: "iowa elite" };
  assert.equal(findStreamToReplace(streams, [], rec), "s1");
  // Already replaced by another recording.
  assert.equal(findStreamToReplace(streams, ["s1"], rec), null);
  // Other team or other day.
  assert.equal(findStreamToReplace(streams, [], { ...rec, teamId: "t2" }), null);
  assert.equal(findStreamToReplace(streams, [], { ...rec, gameDate: "2026-11-23" }), null);
  // No opponent typed: only when there's one stream that day.
  assert.equal(findStreamToReplace(streams, [], { ...rec, opponent: null }), null);
  assert.equal(findStreamToReplace([stream()], [], { ...rec, opponent: "" }), "s1");
  // A different opponent never matches.
  assert.equal(findStreamToReplace([stream()], [], { ...rec, opponent: "KC Pride" }), null);
});

test("families watch the stream until the recording is on YouTube", () => {
  const s = stream();
  const uploading = row({ id: "r1", replaces_stream_id: "s1", youtube_status: "uploading" });
  let games = toWatchGames([s, uploading]);
  assert.deepEqual(games.map((g) => [g.id, !!g.streamed]), [["s1", true]]);

  const onYoutube = row({ id: "r1", replaces_stream_id: "s1", youtube_status: "done", youtube_video_id: "Rec00000001" });
  games = toWatchGames([s, onYoutube]);
  assert.deepEqual(games.map((g) => [g.id, !!g.streamed]), [["r1", false]]);
  // Links shared while it was streamed open the recording.
  assert.equal(watchStreamSwaps([s, onYoutube]).redirect.get("s1"), "r1");
});

test("a recording shows from its file when the stream won't play", () => {
  const privateStream = stream({ youtube_privacy: "private" });
  const uploading = row({ id: "r1", replaces_stream_id: "s1", youtube_status: "uploading" });
  assert.deepEqual(
    toWatchGames([privateStream, uploading]).map((g) => [g.id, g.source.kind]),
    [["r1", "file"]]
  );
});

test("jump-to points move by the gap between tip-offs", () => {
  const { moved, dropped } = shiftStreamMarkers(
    [
      { id: "a", at_seconds: 120, label: "Warm-ups" },
      { id: "b", at_seconds: 401, label: "Tip-off" },
      { id: "c", at_seconds: 1915, label: "Caleb's three" },
    ],
    401,
    54
  );
  assert.deepEqual(
    moved.map((m) => [m.id, m.at_seconds]),
    [
      ["b", 54],
      ["c", 1568],
    ]
  );
  assert.equal(dropped, 1);
});

test("a stream's Film card says Streamed and never asks for a playlist", () => {
  const view = filmFlowView({ row: stream(), display: "done", playlistId: "PL123", missingDetails: false });
  assert.deepEqual(view.steps.map((s) => `${s.key}:${s.state}`), ["streamed:done", "ready:done"]);
  assert.equal(view.badge.text, "Streamed");
  assert.equal(view.needsAttention, false);
  const gone = filmFlowView({ row: stream({ youtube_processing: "missing" }), display: "done", playlistId: null });
  assert.equal(gone.badge.text, "Needs attention");
});

test("0179 adds the stream columns, one recording per stream", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0179_film_streamed_games.sql"), "utf8");
  assert.match(sql, /add column if not exists streamed boolean not null default false/);
  assert.match(sql, /replaces_stream_id uuid\s+references public\.game_film_uploads\(id\) on delete set null/);
  assert.match(sql, /create unique index if not exists game_film_uploads_replaces_stream_uidx/);
  assert.doesNotMatch(sql, /create table/i);
});
