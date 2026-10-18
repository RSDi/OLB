import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decryptSecret, encryptSecret, youtubeTokenKey } from "../../lib/film/crypto.ts";
import type { FilmUpload } from "../../lib/film/types.ts";
import {
  groupUploadsByTeamAndGame,
  nextChunkRange,
  parseResumeRange,
  youtubeChunkHeaders,
  youtubeDescription,
  youtubeInitiateHeaders,
  youtubeTitle,
  youtubeWatchUrl,
  YOUTUBE_CHUNK_BYTES,
} from "../../lib/film/youtube-meta.ts";
import { youtubeAuthorizeUrl, youtubeOAuthConfigured, YOUTUBE_SCOPES } from "../../lib/film/youtube-oauth.ts";

function upload(partial: Partial<FilmUpload> & Pick<FilmUpload, "id" | "team" | "filename">): FilmUpload {
  return {
    team_id: null,
    uploader_name: "Pat",
    content_type: "video/quicktime",
    size_bytes: 12,
    storage_path: "p",
    status: "holding",
    created_at: "2026-10-17T00:00:00Z",
    moved_at: null,
    game_date: "2026-10-17",
    opponent: "Elkhorn",
    our_score: 45,
    their_score: 38,
    youtube_status: null,
    youtube_video_id: null,
    youtube_error: null,
    youtube_updated_at: null,
    ...partial,
  };
}

test("YouTube title is Team vs Opponent – M/D/YYYY", () => {
  assert.equal(
    youtubeTitle({ teamLabel: "14U Gold", opponent: "Elkhorn", gameDate: "2026-10-17" }),
    "14U Gold vs Elkhorn – 10/17/2026"
  );
  assert.equal(youtubeTitle({ teamLabel: "14U Gold", opponent: null, gameDate: "2026-10-17" }), "14U Gold – 10/17/2026");
  assert.match(youtubeDescription({
    teamLabel: "14U Gold",
    opponent: "Elkhorn",
    gameDate: "2026-10-17",
    ourScore: 45,
    theirScore: 38,
  }), /Final: 45–38/);
  assert.equal(youtubeWatchUrl("abc123"), "https://www.youtube.com/watch?v=abc123");
});

test("inbox groups by team then game date and opponent", () => {
  const groups = groupUploadsByTeamAndGame([
    upload({ id: "1", team: "gold14", filename: "a.mov" }),
    upload({ id: "2", team: "gold14", filename: "b.mov", opponent: "Millard", game_date: "2026-10-10" }),
    upload({ id: "3", team: "white14", filename: "c.mov" }),
    upload({ id: "4", team: "gold14", filename: "d.mov", game_date: null, opponent: null, our_score: null, their_score: null }),
  ], { gold14: "14U Gold", white14: "14U White" });
  assert.equal(groups[0]?.label, "14U Gold");
  assert.equal(groups[0]?.games.length, 3);
  assert.equal(groups[0]?.games[0]?.gameDate, "2026-10-17");
  const undated = groups[0]?.games.find((g) => g.gameDate == null);
  assert.equal(undated?.line, null);
  assert.equal(groups[1]?.label, "14U White");
});

test("resumable chunks are 8 MiB and a multiple of 256 KiB", () => {
  assert.equal(YOUTUBE_CHUNK_BYTES % (256 * 1024), 0);
  assert.deepEqual(nextChunkRange(0, 20_000_000), { start: 0, end: YOUTUBE_CHUNK_BYTES - 1 });
  assert.deepEqual(nextChunkRange(YOUTUBE_CHUNK_BYTES, 10_000_000), { start: YOUTUBE_CHUNK_BYTES, end: 9_999_999 });
  assert.equal(nextChunkRange(10_000_000, 10_000_000), null);
  assert.equal(parseResumeRange("bytes=0-8388607"), 8388608);
  const headers = youtubeChunkHeaders("tok", 0, 1023, 5000, "video/mp4");
  assert.equal(headers["Content-Range"], "bytes 0-1023/5000");
  assert.equal(youtubeInitiateHeaders("tok", 5000, "video/quicktime")["X-Upload-Content-Length"], "5000");
});

test("refresh token encrypts with AES-GCM and a 32-byte key", () => {
  const key = youtubeTokenKey({ FILM_YOUTUBE_TOKEN_KEY: "a".repeat(64) });
  assert.equal(key.length, 32);
  const packed = encryptSecret("refresh-token-value", key);
  assert.equal(packed.startsWith("v1."), true);
  assert.equal(packed.includes("refresh-token-value"), false);
  assert.equal(decryptSecret(packed, key), "refresh-token-value");
  assert.throws(() => decryptSecret(packed, Buffer.alloc(32, 2)));
});

test("OAuth authorize URL asks for youtube.upload, offline, and consent", () => {
  assert.equal(youtubeOAuthConfigured({}), false);
  assert.equal(
    youtubeOAuthConfigured({
      FILM_YOUTUBE_CLIENT_ID: "id",
      FILM_YOUTUBE_CLIENT_SECRET: "sec",
      FILM_YOUTUBE_TOKEN_KEY: "a".repeat(64),
    }),
    true
  );
  const url = youtubeAuthorizeUrl("https://olb.example", "state123", {
    FILM_YOUTUBE_CLIENT_ID: "client-id",
  });
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /access_type=offline/);
  assert.match(url, /prompt=consent/);
  assert.match(url, /youtube\.upload/);
  assert.ok(YOUTUBE_SCOPES.some((s) => s.endsWith("youtube.upload")));
});

test("Film inbox plays in-app and Settings has Connect YouTube", () => {
  const inbox = readFileSync(join(import.meta.dirname, "../../app/portal/film/FilmInbox.tsx"), "utf8");
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/FilmYoutubeCard.tsx"), "utf8");
  const complete = readFileSync(join(import.meta.dirname, "../../app/film/complete/route.ts"), "utf8");
  const cron = readFileSync(join(import.meta.dirname, "../../app/api/cron/film-youtube/route.ts"), "utf8");
  const vercel = readFileSync(join(import.meta.dirname, "../../vercel.json"), "utf8");
  assert.match(inbox, />Play</);
  assert.match(inbox, /playsInline/);
  assert.match(inbox, /groupUploadsByTeamAndGame/);
  assert.match(inbox, />\s*Edit\s*</);
  assert.match(inbox, /formatFilmInboxHeading/);
  assert.match(inbox, /Close player/);
  assert.match(inbox, /Retry YouTube/);
  assert.match(settings, /Connect YouTube/);
  assert.match(settings, /Disconnect YouTube/);
  assert.match(settings, /Unlisted/);
  assert.match(complete, /enqueueYoutubeIfConnected/);
  assert.match(complete, /after\(/);
  assert.match(cron, /processYoutubeQueue/);
  assert.match(cron, /maxDuration = 300/);
  assert.match(vercel, /\/api\/cron\/film-youtube/);
  assert.match(vercel, /\* \* \* \* \*/);
});
