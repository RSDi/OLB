import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampTime,
  currentMarkerId,
  filmMomentPath,
  formatTimecode,
  nextSpeed,
  parseMarkerInput,
  parseTimecode,
  type FilmMarker,
} from "../../lib/film/player-logic.ts";

test("timecodes format as m:ss or h:mm:ss", () => {
  assert.equal(formatTimecode(0), "0:00");
  assert.equal(formatTimecode(75.9), "1:15");
  assert.equal(formatTimecode(3725), "1:02:05");
  assert.equal(formatTimecode(-4), "0:00");
  assert.equal(formatTimecode(Number.NaN), "0:00");
});

test("timecodes parse from seconds, m:ss, h:mm:ss and 1m15s", () => {
  assert.equal(parseTimecode("75"), 75);
  assert.equal(parseTimecode("1:15"), 75);
  assert.equal(parseTimecode("1:02:05"), 3725);
  assert.equal(parseTimecode("1m15s"), 75);
  assert.equal(parseTimecode("90s"), 90);
  assert.equal(parseTimecode(12.5), 12.5);
  assert.equal(parseTimecode("1:75"), null);
  assert.equal(parseTimecode("abc"), null);
  assert.equal(parseTimecode(""), null);
  assert.equal(parseTimecode(-1), null);
});

test("markers need a time and a short name", () => {
  assert.deepEqual(parseMarkerInput({ atSeconds: 12.345, label: "  Q2   start " }), { ok: true, atSeconds: 12.35, label: "Q2 start" });
  assert.equal(parseMarkerInput({ atSeconds: 5, label: "  " }).ok, false);
  assert.equal(parseMarkerInput({ atSeconds: "x", label: "Q2" }).ok, false);
  assert.equal(parseMarkerInput({ atSeconds: 5, label: "x".repeat(81) }).ok, false);
});

test("speed steps through the list and stops at the ends", () => {
  assert.equal(nextSpeed(1, 1), 1.5);
  assert.equal(nextSpeed(1, -1), 0.5);
  assert.equal(nextSpeed(2, 1), 2);
  assert.equal(nextSpeed(0.25, -1), 0.25);
});

test("seeking stays inside the video", () => {
  assert.equal(clampTime(-3, 100), 0);
  assert.equal(clampTime(200, 100), 99.9);
  assert.equal(clampTime(50, null), 50);
});

test("share links point at the Film page with v and t", () => {
  assert.equal(filmMomentPath("abc-123", 75.8), "/portal/film?v=abc-123&t=75");
});

test("the current marker is the last one at or before now", () => {
  const m = (id: string, at: number): FilmMarker => ({ id, upload_id: "u", at_seconds: at, label: id, created_at: "" });
  const list = [m("b", 60), m("a", 10), m("c", 120)];
  assert.equal(currentMarkerId(list, 5), null);
  assert.equal(currentMarkerId(list, 10), "a");
  assert.equal(currentMarkerId(list, 90), "b");
  assert.equal(currentMarkerId(list, 500), "c");
});

test("marker table is service-role only and goes with its upload", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0171_game_film_markers.sql"), "utf8");
  assert.ok(sql.includes("references public.game_film_uploads(id) on delete cascade"));
  assert.ok(sql.includes("grant select, insert, update, delete on public.game_film_markers to service_role;"));
  assert.ok(!/grant[^;]*game_film_markers[^;]*\bauthenticated\b/.test(sql));
});

test("adding and removing markers needs Game film (manage)", () => {
  const src = readFileSync(join(process.cwd(), "lib/film/admin-actions.ts"), "utf8");
  for (const fn of ["addFilmMarker", "removeFilmMarker"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}(`));
    assert.ok(body.slice(0, 400).includes("requireFilmManage()"), `${fn} checks manage`);
  }
});

test("the player plays YouTube in the page and has speed, skips, frames and markers", () => {
  const src = readFileSync(join(process.cwd(), "app/portal/film/FilmPlayer.tsx"), "utf8");
  assert.ok(src.includes("https://www.youtube.com/iframe_api"));
  assert.ok(src.includes("setPlaybackRate"));
  assert.ok(src.includes("+ Mark"));
  assert.ok(src.includes("Copy link to this moment"));
});
