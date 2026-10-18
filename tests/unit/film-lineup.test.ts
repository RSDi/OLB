import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filmLineupKey,
  normalizeFilmOpponent,
  parseFilmLineupPlayerIds,
  pickFilmPlayerNames,
} from "../../lib/film/lineup-logic.ts";
import {
  discardedDraftPurgeAt,
  isDiscardedDraftRecoverable,
  SLACK_DRAFT_RETAIN_MS,
} from "../../lib/film/slack-logic.ts";
import { SLACK_DRAFT_RETAIN_DAYS } from "../../lib/film/types.ts";

test("player names prefer a game lineup and fall back to the season roster", () => {
  assert.deepEqual(pickFilmPlayerNames(["Ada", "Bea"], ["Ada", "Bea", "Cam"]), ["Ada", "Bea"]);
  assert.deepEqual(pickFilmPlayerNames([], ["Ada", "Bea", "Cam"]), ["Ada", "Bea", "Cam"]);
  assert.deepEqual(pickFilmPlayerNames(null, ["Ada"]), ["Ada"]);
  assert.deepEqual(pickFilmPlayerNames(["  "], ["Ada"]), ["Ada"]);
});

test("lineup keys normalize opponent and need a team and date", () => {
  assert.equal(normalizeFilmOpponent("  Elkhorn  "), "Elkhorn");
  assert.equal(filmLineupKey("team-1", "2026-10-17", " Elkhorn "), "team-1|2026-10-17|Elkhorn");
  assert.equal(filmLineupKey("team-1", "2026-10-17", null), "team-1|2026-10-17|");
  assert.equal(filmLineupKey(null, "2026-10-17", "Elkhorn"), null);
  assert.equal(filmLineupKey("team-1", null, "Elkhorn"), null);
  assert.deepEqual(parseFilmLineupPlayerIds(["a", "a", "b"]), { ok: true, ids: ["a", "b"] });
  assert.equal(parseFilmLineupPlayerIds("nope").ok, false);
});

test("discarded Slack drafts are recoverable for 30 days", () => {
  assert.equal(SLACK_DRAFT_RETAIN_DAYS, 30);
  const discardedAt = "2026-09-18T12:00:00.000Z";
  const purge = discardedDraftPurgeAt(discardedAt);
  assert.equal(purge.toISOString(), "2026-10-18T12:00:00.000Z");
  assert.equal(isDiscardedDraftRecoverable(discardedAt, Date.parse("2026-10-18T11:59:00.000Z")), true);
  assert.equal(isDiscardedDraftRecoverable(discardedAt, Date.parse("2026-10-18T12:00:00.000Z")), false);
  assert.equal(isDiscardedDraftRecoverable(null), false);
  assert.equal(SLACK_DRAFT_RETAIN_MS, 30 * 24 * 60 * 60 * 1000);
});
