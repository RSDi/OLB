import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyVideosListItems,
  chunkIds,
  fetchYoutubeVideoStatuses,
  isYoutubeStatusStale,
  parseYoutubePrivacy,
  parseYoutubeProcessing,
  youtubeStatusListUrl,
  YOUTUBE_PROCESSING_SYNC_MS,
  YOUTUBE_READY_SYNC_MS,
  YOUTUBE_STATUS_BATCH,
  YOUTUBE_STATUS_PART,
} from "../../lib/film/youtube-live.ts";
import {
  youtubeLiveStatusLine,
  youtubePrivacyLabel,
  youtubeProcessingLabel,
} from "../../lib/film/youtube-meta.ts";
import { YOUTUBE_SCOPES } from "../../lib/film/youtube-oauth.ts";

test("videos.list privacy and processing parse from part=status", () => {
  assert.equal(parseYoutubePrivacy("unlisted"), "unlisted");
  assert.equal(parseYoutubePrivacy("private"), "private");
  assert.equal(parseYoutubePrivacy("public"), "public");
  assert.equal(parseYoutubePrivacy("hidden"), null);
  assert.equal(parseYoutubeProcessing("uploaded"), "uploaded");
  assert.equal(parseYoutubeProcessing("processed"), "processed");
  assert.equal(parseYoutubeProcessing("failed"), "failed");
  assert.equal(parseYoutubeProcessing("nope"), null);

  const live = applyVideosListItems(["keep", "gone"], [
    { id: "keep", status: { privacyStatus: "unlisted", uploadStatus: "processed" } },
  ]);
  assert.deepEqual(live, [
    { videoId: "keep", youtube_privacy: "unlisted", youtube_processing: "processed" },
    { videoId: "gone", youtube_privacy: null, youtube_processing: "missing" },
  ]);
});

test("videos.list ids are requested in batches of 50 with part=status", () => {
  const ids = Array.from({ length: 51 }, (_, i) => `v${i}`);
  const batches = chunkIds(ids);
  assert.equal(YOUTUBE_STATUS_BATCH, 50);
  assert.equal(YOUTUBE_STATUS_PART, "status");
  assert.equal(batches.length, 2);
  assert.equal(batches[0]?.length, 50);
  assert.equal(batches[1]?.length, 1);
  const url = youtubeStatusListUrl(["abc", "def"]);
  assert.match(url, /youtube\/v3\/videos/);
  assert.match(url, /part=status/);
  assert.match(url, /id=abc%2Cdef/);
});

test("stale windows keep a light schedule: processing soon, ready later", () => {
  const now = Date.parse("2026-10-18T18:00:00Z");
  assert.equal(isYoutubeStatusStale({ youtube_synced_at: null, youtube_processing: null }, now), true);
  assert.equal(
    isYoutubeStatusStale(
      { youtube_synced_at: new Date(now - 60_000).toISOString(), youtube_processing: "uploaded" },
      now
    ),
    false
  );
  assert.equal(
    isYoutubeStatusStale(
      { youtube_synced_at: new Date(now - YOUTUBE_PROCESSING_SYNC_MS).toISOString(), youtube_processing: "uploaded" },
      now
    ),
    true
  );
  assert.equal(
    isYoutubeStatusStale(
      { youtube_synced_at: new Date(now - 60 * 60 * 1000).toISOString(), youtube_processing: "processed" },
      now
    ),
    false
  );
  assert.equal(
    isYoutubeStatusStale(
      { youtube_synced_at: new Date(now - YOUTUBE_READY_SYNC_MS).toISOString(), youtube_processing: "processed" },
      now
    ),
    true
  );
});

test("fetchYoutubeVideoStatuses GETs videos.list and never writes", async () => {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(
      JSON.stringify({
        items: [{ id: "abc", status: { privacyStatus: "private", uploadStatus: "uploaded" } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;
  const live = await fetchYoutubeVideoStatuses("tok", ["abc"], fetchImpl);
  assert.deepEqual(live, [{ videoId: "abc", youtube_privacy: "private", youtube_processing: "uploaded" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.match(calls[0]?.url ?? "", /part=status/);
  assert.match(calls[0]?.url ?? "", /id=abc/);
});

test("inbox labels show real privacy and processing, not the upload default", () => {
  assert.equal(youtubePrivacyLabel("unlisted"), "Unlisted");
  assert.equal(youtubePrivacyLabel("private"), "Private");
  assert.equal(youtubePrivacyLabel("public"), "Public");
  assert.equal(youtubeProcessingLabel("uploaded"), "Processing");
  assert.equal(youtubeProcessingLabel("processed"), "Ready");
  assert.equal(youtubeProcessingLabel("missing"), "Not on YouTube");
  assert.equal(
    youtubeLiveStatusLine({
      youtube_privacy: "unlisted",
      youtube_processing: "processed",
      youtube_synced_at: "2026-10-18T18:00:00Z",
    }),
    "Unlisted · Ready"
  );
  assert.equal(
    youtubeLiveStatusLine({
      youtube_privacy: "private",
      youtube_processing: "uploaded",
      youtube_synced_at: "2026-10-18T18:00:00Z",
    }),
    "Private · Processing"
  );
  assert.equal(
    youtubeLiveStatusLine({
      youtube_privacy: null,
      youtube_processing: null,
      youtube_synced_at: null,
    }),
    "Privacy not checked yet"
  );
});

test("status sync is read-only and uses scopes the app already requests", () => {
  const status = readFileSync(join(import.meta.dirname, "../../lib/film/youtube-status.ts"), "utf8");
  const live = readFileSync(join(import.meta.dirname, "../../lib/film/youtube-live.ts"), "utf8");
  const oauth = readFileSync(join(import.meta.dirname, "../../lib/film/youtube-oauth.ts"), "utf8");
  const actions = readFileSync(join(import.meta.dirname, "../../lib/film/youtube-actions.ts"), "utf8");
  const inbox = readFileSync(join(import.meta.dirname, "../../app/portal/film/FilmInbox.tsx"), "utf8");
  const cron = readFileSync(join(import.meta.dirname, "../../app/api/cron/film-youtube/route.ts"), "utf8");

  assert.match(live, /part.*status/);
  assert.match(live, /method: "GET"/);
  assert.doesNotMatch(live, /videos\.update|uploadType|privacyStatus:/);
  assert.doesNotMatch(live, /method: "POST"|method: "PUT"|method: "PATCH"/);
  assert.doesNotMatch(status, /videos\.update|method: "POST"|method: "PUT"|method: "PATCH"/);
  assert.match(oauth, /videos\.list part=status/);
  assert.ok(YOUTUBE_SCOPES.includes("https://www.googleapis.com/auth/youtube.readonly"));
  assert.ok(!YOUTUBE_SCOPES.includes("https://www.googleapis.com/auth/youtube.force-ssl"));
  assert.match(actions, /export async function refreshFilmYoutubeStatus[\s\S]*?requireFilmAccess\(\)/);
  assert.match(inbox, />Refresh YouTube status</);
  assert.match(inbox, /Checking YouTube/);
  assert.match(inbox, /YouTube status is up to date/);
  assert.match(inbox, /youtubeLiveStatusLine/);
  assert.match(cron, /syncYoutubeVideoStatus/);
  assert.match(cron, /YOUTUBE_STATUS_CRON_LIMIT/);
});
