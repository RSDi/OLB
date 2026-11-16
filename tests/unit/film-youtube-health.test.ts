import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { youtubeWorkerProblem } from "../../lib/film/youtube-health.ts";

test("expired Google login pauses uploads with a fix", () => {
  const msg = youtubeWorkerProblem("Token has been expired or revoked.");
  assert.match(msg ?? "", /login expired/);
  assert.match(msg ?? "", /Connect again/);
  assert.match(youtubeWorkerProblem("invalid_grant") ?? "", /login expired/);
});

test("not connected and not set up are reported", () => {
  assert.match(youtubeWorkerProblem("YouTube isn't connected.") ?? "", /No YouTube channel/);
  assert.match(youtubeWorkerProblem("YouTube OAuth env vars are not set.") ?? "", /isn't set up/);
});

test("a network blip doesn't change the banner", () => {
  assert.equal(youtubeWorkerProblem("fetch failed"), undefined);
  assert.equal(youtubeWorkerProblem("Couldn't refresh YouTube."), undefined);
});

test("the worker records health and the page shows the paused banner", () => {
  const worker = readFileSync("lib/film/youtube.ts", "utf8");
  assert.match(worker, /recordYoutubeWorkerHealth\(null\)/);
  assert.match(worker, /noteSkip\(result\)/);
  const inbox = readFileSync("app/portal/film/FilmInbox.tsx", "utf8");
  assert.match(inbox, /YouTube uploads are paused\./);
  const card = readFileSync("app/portal/settings/FilmYoutubeCard.tsx", "utf8");
  assert.match(card, />\s*Connect again\s*</);
});
