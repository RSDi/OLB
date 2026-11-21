import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanEventName,
  formatDateRange,
  groupWatchGames,
  seasonRecord,
  toWatchGames,
  watchGamePath,
  watchPageKey,
  watchPagePath,
  parseWatchPageKey,
  watchSource,
  weekendKey,
  type WatchGame,
} from "../../lib/film/watch.ts";
import type { FilmUpload } from "../../lib/film/types.ts";

let n = 0;
function game(gameDate: string, partial: Partial<WatchGame> = {}): WatchGame {
  n += 1;
  return {
    id: `g${n}`,
    gameDate,
    opponent: `Team ${n}`,
    ourScore: null,
    theirScore: null,
    eventName: null,
    createdAt: `${gameDate}T1${n % 10}:00:00Z`,
    source: { kind: "youtube", videoId: `v${n}` },
    ...partial,
  };
}

test("Fri, Sat and Sun share the Saturday's weekend; weekdays stand alone", () => {
  // 2026-11-13 is a Friday.
  assert.deepEqual(weekendKey("2026-11-13"), { key: "2026-11-14", weekend: true });
  assert.deepEqual(weekendKey("2026-11-14"), { key: "2026-11-14", weekend: true });
  assert.deepEqual(weekendKey("2026-11-15"), { key: "2026-11-14", weekend: true });
  assert.deepEqual(weekendKey("2026-11-11"), { key: "2026-11-11", weekend: false });
});

test("date ranges read like a schedule", () => {
  assert.equal(formatDateRange("2026-11-15", "2026-11-15"), "Nov 15");
  assert.equal(formatDateRange("2026-11-15", "2026-11-16"), "Nov 15–16");
  assert.equal(formatDateRange("2026-10-31", "2026-11-01"), "Oct 31–Nov 1");
});

test("named tournaments group together, the rest by weekend, newest first", () => {
  const sections = groupWatchGames([
    game("2026-11-14", { eventName: "Heartland Classic", ourScore: 41, theirScore: 33 }),
    game("2026-11-15", { eventName: "heartland classic", ourScore: 30, theirScore: 35 }),
    game("2026-11-08"),
    game("2026-11-07"),
    game("2026-11-11"),
  ]);
  assert.deepEqual(
    sections.map((s) => [s.kind, s.title, s.dates, s.games.length]),
    [
      ["event", "Heartland Classic", "Nov 14–15", 2],
      ["day", "Wed, Nov 11", "Nov 11", 1],
      ["weekend", "Weekend of Nov 7–8", "Nov 7–8", 2],
    ]
  );
  assert.equal(sections[0].wins, 1);
  assert.equal(sections[0].losses, 1);
  // Oldest first inside a section.
  assert.deepEqual(sections[2].games.map((g) => g.gameDate), ["2026-11-07", "2026-11-08"]);
});

test("a league named the same every week splits into its weekends", () => {
  const sections = groupWatchGames([
    game("2026-11-01", { eventName: "Metro League" }),
    game("2026-11-08", { eventName: "Metro League" }),
  ]);
  assert.equal(sections.length, 2);
  assert.ok(sections.every((s) => s.title === "Metro League"));
});

test("season record skips games without a score and ties", () => {
  assert.deepEqual(
    seasonRecord([
      game("2026-11-01", { ourScore: 40, theirScore: 30 }),
      game("2026-11-02", { ourScore: 20, theirScore: 30 }),
      game("2026-11-03", { ourScore: 30, theirScore: 30 }),
      game("2026-11-04"),
    ]),
    { wins: 1, losses: 1 }
  );
});

test("tournament names are trimmed and capped", () => {
  assert.deepEqual(cleanEventName("  Fall   Fest  "), { ok: true, value: "Fall Fest" });
  assert.deepEqual(cleanEventName(""), { ok: true, value: null });
  assert.deepEqual(cleanEventName(null), { ok: true, value: null });
  assert.deepEqual(cleanEventName("x".repeat(81)), { ok: false });
  assert.deepEqual(cleanEventName(5), { ok: false });
});

const base = {
  youtube_status: null,
  youtube_video_id: null,
  youtube_privacy: null,
  youtube_processing: null,
  file_deleted_at: null,
} as const;

test("games play from YouTube unless private, else the original while we have it", () => {
  assert.deepEqual(watchSource({ ...base, youtube_status: "done", youtube_video_id: "abc", youtube_privacy: "unlisted" }), {
    kind: "youtube",
    videoId: "abc",
  });
  assert.deepEqual(watchSource({ ...base, youtube_status: "done", youtube_video_id: "abc", youtube_privacy: "private" }), {
    kind: "file",
  });
  assert.deepEqual(watchSource({ ...base, youtube_status: "uploading" }), { kind: "file" });
  assert.equal(
    watchSource({ ...base, youtube_status: "done", youtube_video_id: "abc", youtube_privacy: "private", file_deleted_at: "2026-11-01" }),
    null
  );
  assert.equal(
    watchSource({ ...base, youtube_status: "done", youtube_video_id: "abc", youtube_processing: "deleted", file_deleted_at: "2026-11-01" }),
    null
  );
});

test("uploads without a game date fall back to the upload day", () => {
  const row = {
    ...base,
    id: "u1",
    created_at: "2026-11-14T20:00:00Z",
    game_date: null,
    opponent: null,
    our_score: null,
    their_score: null,
    event_name: null,
  } as unknown as FilmUpload;
  assert.equal(toWatchGames([row])[0].gameDate, "2026-11-14");
});

test("share links point at the team page", () => {
  const key = watchPageKey("6b-black", "3f9a0c7e1b2d");
  assert.equal(key, "6b-black-3f9a0c7e1b2d");
  assert.equal(watchPagePath(key), "/watch/6b-black-3f9a0c7e1b2d");
  assert.equal(watchGamePath(key, "u1"), "/watch/6b-black-3f9a0c7e1b2d?v=u1");
  assert.equal(watchGamePath(key, "u1", 75.9), "/watch/6b-black-3f9a0c7e1b2d?v=u1&t=75");
});

test("team page links need the random key", () => {
  assert.deepEqual(parseWatchPageKey("6b-black-3f9a0c7e1b2d"), { slug: "6b-black", token: "3f9a0c7e1b2d" });
  assert.deepEqual(parseWatchPageKey("HS-JV-3F9A0C7E1B2D"), { slug: "hs-jv", token: "3f9a0c7e1b2d" });
  for (const bad of ["6b-black", "hs-jv", "3f9a0c7e1b2d", "-3f9a0c7e1b2d", "6b-black-3f9a0c7e1b", "6b-black-3f9a0c7e1b2g", ""]) {
    assert.equal(parseWatchPageKey(bad), null, bad);
  }
});

test("0178 gives every team its own link key", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0178_film_watch_token.sql"), "utf8");
  assert.match(sql, /add column if not exists film_watch_token text not null/);
  assert.match(sql, /gen_random_uuid\(\)/);
  assert.match(sql, /\^\[0-9a-f\]\{12\}\$/);
  assert.doesNotMatch(sql, /create table/i);
});

test("0177 adds the watch toggle and tournament name without new tables", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0177_film_watch_page.sql"), "utf8");
  assert.match(sql, /film_watch_public boolean not null default false/);
  assert.match(sql, /add column if not exists event_name text/);
  assert.doesNotMatch(sql, /create table/i);
});
