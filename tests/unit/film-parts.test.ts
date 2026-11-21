import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FILM_PARTS, compareFilmParts, filmPartLabel, parseFilmPart } from "../../lib/film/parts.ts";
import { watchGames } from "../../lib/film/watch.ts";
import { youtubeTitle } from "../../lib/film/youtube-meta.ts";
import { validateUploadInput } from "../../lib/film/validation.ts";
import type { FilmUpload } from "../../lib/film/types.ts";

function row(partial: Partial<FilmUpload> & Pick<FilmUpload, "id">): FilmUpload {
  return {
    team: "hs-varsity",
    team_id: "t1",
    uploader_name: "Pat",
    filename: `${partial.id}.mov`,
    content_type: "video/quicktime",
    size_bytes: 10,
    storage_path: `p/${partial.id}`,
    status: "holding",
    created_at: "2026-11-22T15:00:00Z",
    moved_at: null,
    file_deleted_at: null,
    game_date: "2026-11-22",
    opponent: "Iowa Elite",
    our_score: null,
    their_score: null,
    event_name: null,
    youtube_status: "done",
    youtube_video_id: `yt_${partial.id}`.padEnd(11, "x").slice(0, 11),
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
    part: null,
    ...partial,
  };
}

test("parts parse, label and sort in play order", () => {
  assert.deepEqual(parseFilmPart(""), { ok: true, part: null });
  assert.deepEqual(parseFilmPart("h2"), { ok: true, part: "h2" });
  assert.equal(parseFilmPart("h3").ok, false);
  assert.equal(filmPartLabel("ot"), "Overtime");
  assert.equal(filmPartLabel(null), null);
  const sorted = [
    { part: null, createdAt: "1" },
    { part: "ot", createdAt: "2" },
    { part: "h2", createdAt: "3" },
    { part: "h1", createdAt: "4" },
  ].sort(compareFilmParts);
  assert.deepEqual(sorted.map((p) => p.part), ["h1", "h2", "ot", null]);
});

test("a game's videos show as one game with parts in order", () => {
  const { games } = watchGames([
    row({ id: "b", part: "h2", our_score: 50, their_score: 44 }),
    row({ id: "a", part: "h1" }),
    row({ id: "c", part: "ot", opponent: "iowa elite" }),
    row({ id: "other", opponent: "KC Pride" }),
  ]);
  assert.equal(games.length, 2);
  const game = games.find((g) => g.opponent === "Iowa Elite")!;
  assert.deepEqual(game.parts!.map((p) => [p.id, p.label]), [
    ["a", "1st half"],
    ["b", "2nd half"],
    ["c", "Overtime"],
  ]);
  assert.equal(game.id, "a");
  assert.equal(game.ourScore, 50);
  const single = games.find((g) => g.opponent === "KC Pride")!;
  assert.deepEqual(single.parts!.map((p) => p.label), [null]);
});

test("videos that don't say which part are Video 1, Video 2", () => {
  const { games } = watchGames([
    row({ id: "x", created_at: "2026-11-22T16:00:00Z" }),
    row({ id: "y", created_at: "2026-11-22T15:00:00Z" }),
  ]);
  assert.deepEqual(games[0].parts!.map((p) => [p.id, p.label]), [
    ["y", "Video 1"],
    ["x", "Video 2"],
  ]);
});

test("games without an opponent never merge", () => {
  const { games } = watchGames([row({ id: "x", opponent: null }), row({ id: "y", opponent: null })]);
  assert.equal(games.length, 2);
});

test("a stream steps aside once any part of the recording is on YouTube", () => {
  const stream = row({ id: "s", streamed: true, file_deleted_at: "2026-11-22T15:00:00Z", youtube_video_id: "Stream00001" });
  const h1Uploading = row({ id: "h1", part: "h1", youtube_status: "uploading", youtube_video_id: null });
  let out = watchGames([stream, h1Uploading]);
  assert.deepEqual(out.games[0].parts!.map((p) => p.id), ["s"]);
  assert.equal(out.games[0].streamed, true);

  const h1Done = row({ id: "h1", part: "h1" });
  const h2Uploading = row({ id: "h2", part: "h2", youtube_status: "uploading", youtube_video_id: null });
  out = watchGames([stream, h1Done, h2Uploading]);
  assert.deepEqual(out.games[0].parts!.map((p) => [p.id, p.source.kind]), [
    ["h1", "youtube"],
    ["h2", "file"],
  ]);
  assert.equal(out.redirect.get("s"), "h1");
});

test("the part goes on the end of the YouTube title, even when it's cut short", () => {
  assert.equal(
    youtubeTitle({ teamLabel: "HS Varsity", opponent: "Iowa Elite", gameDate: "2026-11-22", partLabel: "2nd half" }),
    "HS Varsity vs Iowa Elite – 11/22/2026 (2nd half)"
  );
  const long = youtubeTitle({ teamLabel: "HS Varsity", opponent: "X".repeat(120), gameDate: "2026-11-22", partLabel: "Overtime" });
  assert.ok(long.length <= 100, String(long.length));
  assert.ok(long.endsWith("… (Overtime)"), long);
});

test("uploads say which part, or nothing", () => {
  const base = { uploaderName: "Pat", filename: "a.mov", contentType: "video/quicktime", sizeBytes: 10, gameDate: "2026-11-22" };
  const ok = validateUploadInput({ ...base, part: "q3" }, "2026-11-22");
  assert.ok(ok.ok && ok.part === "q3");
  const none = validateUploadInput(base, "2026-11-22");
  assert.ok(none.ok && none.part === null);
  assert.equal(validateUploadInput({ ...base, part: "halftime" }, "2026-11-22").ok, false);
});

test("0182's check lists exactly the codes in parts.ts", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0182_film_game_parts.sql"), "utf8");
  const listed = /part in \(([^)]+)\)/.exec(sql)![1].split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual(listed, FILM_PARTS.map((p) => p.code));
  assert.match(sql, /add column if not exists part text/);
});
