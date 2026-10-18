import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkFilmTeamCode,
  codesMatch,
  encodeFilmSession,
  parseFilmSession,
  sessionMatchesTeam,
} from "../../lib/film/session.ts";
import { filmSlugProblem, slugifyFilmTeam } from "../../lib/film/teams.ts";
import {
  filmCodeMatches,
  filmCodeProblem,
  filmCodeUsedByOther,
  generateFilmCode,
  hashFilmCode,
  normalizeFilmCode,
  pickUniqueFilmCode,
  suggestTeamWordCode,
} from "../../lib/film/codes.ts";
import {
  formatFilmDate,
  formatFilmGameLine,
  formatFilmInboxHeading,
  formatFilmScore,
  missingFilmGameLabels,
  parseFilmGameFields,
} from "../../lib/film/game-meta.ts";
import {
  cleanUploaderName,
  isVideoFile,
  validateUploadInput,
} from "../../lib/film/validation.ts";
import { canApproveFilmSlack, canManageFilm, canViewFilm, hasPermission, type MemberLike } from "../../lib/auth/permissions.ts";
import { tusEndpoint } from "../../lib/film/supabase-storage.ts";
import { isCompactJws, tusSignedHeaders, tusUploadMetadata } from "../../lib/film/tus.ts";
import { TOKEN_LIMIT, rateLimitTake } from "../../lib/film/rate-limit.ts";
import { allUploadsFinished, formatBytes, formatFinishTime, isLargeFilmFile } from "../../lib/film/guest-status.ts";
import type { FilmTeamRow } from "../../lib/film/teams.ts";

const ENV = {
  FILM_SESSION_SECRET: "film-session-secret-for-tests-not-real",
};

const approved = (perms: string[]): MemberLike => ({
  role: "member",
  status: "approved",
  permissions: perms,
});

function team(partial: Partial<FilmTeamRow> & Pick<FilmTeamRow, "id" | "slug">): FilmTeamRow {
  return {
    boardId: "board",
    label: "14U White",
    enabled: true,
    hasCode: true,
    hasSlug: true,
    codeVersion: 1,
    codeHash: hashFilmCode(partial.id, "white-code"),
    suggestedCode: "white14",
    youtubePlaylistId: null,
    youtubeTitleTemplate: null,
    youtubeDescriptionTemplate: null,
    includeStatsBook: false,
    includePlayers: false,
    includeTournament: false,
    includePlaylistLink: false,
    slackChannelId: null,
    ...partial,
  };
}

test("team names become /t/ slugs", () => {
  assert.equal(slugifyFilmTeam("14U White"), "14u-white");
  assert.equal(slugifyFilmTeam("  16U Black  "), "16u-black");
  assert.equal(filmSlugProblem("14u-white"), null);
  assert.equal(filmSlugProblem("14U White"), "Use lowercase letters, numbers and hyphens.");
  assert.equal(filmSlugProblem(""), "Pick an address for the family upload page.");
});

test("upload codes are hashed; plaintext is not recoverable", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const stored = hashFilmCode(id, "White-Code");
  assert.equal(stored.startsWith("v1."), true);
  assert.equal(stored.includes("white-code"), false);
  assert.equal(filmCodeMatches(stored, id, "white-code"), true);
  assert.equal(filmCodeMatches(stored, id, "White-Code"), true);
  assert.equal(filmCodeMatches(stored, id, "nope"), false);
  assert.equal(filmCodeMatches(stored, "other-id", "white-code"), false);
  assert.equal(filmCodeProblem("abc"), "Use at least 4 letters or numbers.");
  assert.equal(filmCodeProblem("white-14"), "Use letters and numbers only (no spaces or punctuation).");
  assert.equal(filmCodeProblem("WHITE14"), null);
  assert.equal(filmCodeProblem("a".repeat(21)), "Keep it to 20 letters or numbers.");
  assert.match(generateFilmCode(), /^[a-z0-9]{8}$/);
  assert.equal(normalizeFilmCode("  White14  "), "white14");
});

test("suggested team-word codes come from the name and age, lowercase", () => {
  assert.equal(suggestTeamWordCode({ name: "White", ageGroup: "14U" }), "white14");
  assert.equal(suggestTeamWordCode({ name: "14U White", ageGroup: "14U" }), "white14");
  assert.equal(suggestTeamWordCode({ name: "Gold", ageGroup: "16U" }), "gold16");
  assert.equal(suggestTeamWordCode({ name: "14U White", ageGroup: null, label: "14U White" }), "white14");
  assert.equal(suggestTeamWordCode({ name: "WHITE", ageGroup: "14u" }), "white14");
  const taken = new Set(["white14"]);
  assert.equal(
    pickUniqueFilmCode("white14", (c) => taken.has(c)),
    "white142"
  );
  const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const rows = [
    { id: a, codeHash: hashFilmCode(a, "white14") },
    { id: b, codeHash: hashFilmCode(b, "gold16") },
  ];
  assert.equal(filmCodeUsedByOther(rows, a, "white14"), false);
  assert.equal(filmCodeUsedByOther(rows, a, "gold16"), true);
  assert.equal(filmCodeUsedByOther(rows, a, "GOLD16"), true);
});

test("the shared team code is checked in constant time and fails closed", () => {
  const row = team({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", slug: "14u-white" });
  assert.equal(checkFilmTeamCode(row, "white-code"), "ok");
  assert.equal(checkFilmTeamCode(row, "nope"), "wrong");
  assert.equal(checkFilmTeamCode({ ...row, enabled: false }, "white-code"), "unset");
  assert.equal(checkFilmTeamCode({ ...row, hasCode: false, codeHash: null }, "white-code"), "unset");
  assert.equal(checkFilmTeamCode(null, "white-code"), "unset");
  assert.equal(codesMatch("abc", "abc"), true);
  assert.equal(codesMatch("abc", "abd"), false);
});

test("the film session cookie includes the code version so rotate unlocks old phones", () => {
  const raw = encodeFilmSession("14u-white", 1, 1_700_000_000_000, ENV);
  assert.ok(raw);
  assert.deepEqual(parseFilmSession(raw, 1_700_000_000_000, ENV), { slug: "14u-white", version: 1 });
  assert.equal(parseFilmSession(raw, 1_700_000_000_000 + 8 * 24 * 60 * 60 * 1000, ENV), null);
  assert.equal(parseFilmSession("nope", 1_700_000_000_000, ENV), null);
  const v2 = encodeFilmSession("14u-white", 2, 1_700_000_000_000, ENV)!;
  assert.deepEqual(parseFilmSession(v2, 1_700_000_000_000, ENV), { slug: "14u-white", version: 2 });
  const row = team({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", slug: "14u-white", codeVersion: 2 });
  assert.equal(sessionMatchesTeam(parseFilmSession(raw, 1_700_000_000_000, ENV), row), false);
  assert.equal(sessionMatchesTeam(parseFilmSession(v2, 1_700_000_000_000, ENV), row), true);
  assert.equal(parseFilmSession(raw, 1_700_000_000_000, { FILM_SESSION_SECRET: "other" }), null);
  assert.equal(encodeFilmSession("14u-white", 1, 1, {}), null);
});

test("video validation accepts iPhone .mov / HEVC and rejects non-video", () => {
  assert.equal(isVideoFile("game.mov", "video/quicktime"), true);
  assert.equal(isVideoFile("game.MOV", ""), true);
  assert.equal(isVideoFile("game.mp4", "video/mp4"), true);
  assert.equal(isVideoFile("clip.hevc", "video/hevc"), true);
  assert.equal(isVideoFile("notes.pdf", "application/pdf"), false);
  assert.equal(isVideoFile("photo.jpg", "image/jpeg"), false);
  assert.deepEqual(validateUploadInput({
    uploaderName: "  Pat  ",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 12_000_000,
    gameDate: "2026-10-17",
    opponent: "  Elkhorn  ",
    ourScore: "45",
    theirScore: 38,
  }), {
    ok: true,
    uploaderName: "Pat",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 12_000_000,
    gameDate: "2026-10-17",
    opponent: "Elkhorn",
    ourScore: 45,
    theirScore: 38,
  });
  assert.equal(validateUploadInput({
    uploaderName: " ",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 1,
  }).ok, false);
  assert.equal(validateUploadInput({
    uploaderName: "Pat",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 21 * 1024 * 1024 * 1024,
  }).ok, false);
  assert.equal(cleanUploaderName("x".repeat(81)), null);
});

test("game date defaults to Chicago today; opponent and scores are optional", () => {
  const today = "2026-10-17";
  const result = validateUploadInput({
    uploaderName: "Pat",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 12_000_000,
  }, today);
  assert.deepEqual(result, {
    ok: true,
    uploaderName: "Pat",
    filename: "game.mov",
    contentType: "video/quicktime",
    sizeBytes: 12_000_000,
    gameDate: today,
    opponent: null,
    ourScore: null,
    theirScore: null,
  });
  assert.equal(parseFilmGameFields({ gameDate: "2026-02-31" }, today).ok, false);
  assert.equal(parseFilmGameFields({ gameDate: today, opponent: "x".repeat(81) }, today).ok, false);
  assert.equal(parseFilmGameFields({ gameDate: today, ourScore: 1000 }, today).ok, false);
  assert.equal(parseFilmGameFields({ gameDate: today, ourScore: "12.5" }, today).ok, false);
  assert.deepEqual(parseFilmGameFields({ gameDate: today, ourScore: "0", theirScore: "" }, today), {
    ok: true,
    gameDate: today,
    opponent: null,
    ourScore: 0,
    theirScore: null,
  });
  assert.equal(formatFilmDate("2026-10-17"), "Oct 17, 2026");
  assert.equal(formatFilmScore(45, 38), "45–38");
  assert.equal(formatFilmScore(45, null), "Us 45");
  assert.equal(formatFilmScore(null, 38), "Them 38");
  assert.equal(
    formatFilmGameLine({ gameDate: "2026-10-17", opponent: "Elkhorn", ourScore: 45, theirScore: 38 }),
    "Oct 17, 2026 · vs Elkhorn · 45–38"
  );
  assert.equal(
    formatFilmGameLine({ gameDate: "2026-10-17", opponent: null, ourScore: null, theirScore: null }),
    "Oct 17, 2026"
  );
  assert.equal(formatFilmGameLine({ gameDate: null, opponent: null }), null);
  assert.equal(formatFilmInboxHeading({ gameDate: null, opponent: null }), "No game date");
  assert.equal(
    formatFilmInboxHeading({ gameDate: null, opponent: "Elkhorn Attack", ourScore: 18, theirScore: 29 }),
    "No game date · vs Elkhorn Attack · 18–29"
  );
  assert.equal(
    formatFilmInboxHeading({ gameDate: "2026-10-17", opponent: "Elkhorn Attack", ourScore: 18, theirScore: 29 }),
    "Oct 17, 2026 · vs Elkhorn Attack · 18–29"
  );
  assert.deepEqual(missingFilmGameLabels({ gameDate: null, opponent: null, ourScore: null, theirScore: null }), [
    "Game date",
    "Opponent",
    "Score",
  ]);
  assert.equal(parseFilmGameFields({ gameDate: "" }, today, { emptyDate: "error" }).ok, false);
  assert.equal(parseFilmGameFields({ gameDate: "" }, today, { emptyDate: "today" }).ok, true);
});

test("film_view lists; film_manage includes view; others are out", () => {
  assert.equal(canViewFilm(approved(["film_view"])), true);
  assert.equal(canManageFilm(approved(["film_view"])), false);
  assert.equal(canViewFilm(approved(["film_manage"])), true);
  assert.equal(canManageFilm(approved(["film_manage"])), true);
  assert.equal(canViewFilm(approved(["payments"])), false);
  assert.equal(canViewFilm({ role: "member", status: "pending", permissions: ["film_view"] }), false);
  assert.equal(hasPermission({ role: "super_admin", status: "approved" }, "film_view"), true);
  assert.equal(canManageFilm({ role: "super_admin", status: "approved" }), true);
  assert.equal(canViewFilm({ role: "admin", status: "approved", permissions: [] }), false);
  assert.equal(canApproveFilmSlack(approved(["teams"])), true);
  assert.equal(canApproveFilmSlack(approved(["film_manage"])), true);
  assert.equal(canApproveFilmSlack(approved(["film_view"])), false);
  assert.equal(canApproveFilmSlack({ role: "super_admin", status: "approved" }), true);
});

test("the TUS endpoint is the signed path on the direct storage hostname", () => {
  assert.equal(
    tusEndpoint("https://abcd.supabase.co"),
    "https://abcd.storage.supabase.co/storage/v1/upload/resumable/sign"
  );
  assert.equal(
    tusEndpoint("https://abcd.supabase.co/"),
    "https://abcd.storage.supabase.co/storage/v1/upload/resumable/sign"
  );
  assert.equal(
    tusEndpoint("https://abcd.storage.supabase.co"),
    "https://abcd.storage.supabase.co/storage/v1/upload/resumable/sign"
  );
  assert.equal(tusEndpoint("https://abcd.supabase.co").endsWith("/upload/resumable"), false);
});

test("signed TUS headers send x-signature once and never a bearer or apikey", () => {
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJnYW1lLWZpbG0vYSJ9.tok";
  assert.equal(isCompactJws(token), true);
  assert.equal(isCompactJws("sb_publishable_abc"), false);
  assert.equal(isCompactJws(""), false);
  assert.equal(isCompactJws(`${token}, ${token}`), false);
  assert.deepEqual(tusSignedHeaders(token), {
    "x-signature": token,
    "x-upsert": "false",
  });
  assert.equal(tusSignedHeaders(token).authorization, undefined);
  assert.equal(tusSignedHeaders(token).apikey, undefined);
  const meta = tusUploadMetadata({
    bucketName: "game-film",
    objectName: "white14/a/clip.mov",
    contentType: "video/quicktime",
  });
  assert.match(meta, /^bucketName [A-Za-z0-9+/=]+,objectName [A-Za-z0-9+/=]+,contentType [A-Za-z0-9+/=]+,cacheControl [A-Za-z0-9+/=]+$/);
  assert.equal(Buffer.from(meta.split(",")[0]!.split(" ")[1]!, "base64").toString("utf8"), "game-film");
});

test("the guest uploader uses a server-created TUS URL and does not double-set headers", () => {
  const client = readFileSync(join(import.meta.dirname, "../../app/t/[team]/TeamUpload.tsx"), "utf8");
  const mint = readFileSync(join(import.meta.dirname, "../../lib/film/supabase-storage.ts"), "utf8");
  const route = readFileSync(join(import.meta.dirname, "../../app/film/upload-token/route.ts"), "utf8");
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/FilmSettingsTab.tsx"), "utf8");
  assert.match(client, /tusSignedHeaders/);
  assert.match(client, /allowedFileTypes: \["video\/\*".*\.mov/);
  assert.match(client, /maxFileSize: MAX_UPLOAD_BYTES/);
  assert.match(client, /Phone \.mov files are fine\. Up to 20 GB each\./);
  assert.match(client, /Tip: record in 1080p at 30 fps \(iPhone: Settings → Camera → Record Video\)\./);
  assert.match(client, /This file is over 4 GB/);
  assert.match(client, /isLargeFilmFile/);
  assert.match(client, /✓ Uploaded/);
  assert.match(client, /All videos uploaded — you can close this page\./);
  assert.match(client, /Keep this page open and keep your phone plugged in/);
  assert.match(client, />\s*Retry\s*</);
  assert.match(client, /allUploadsFinished/);
  assert.match(client, /retryUpload/);
  assert.match(client, /setFileState\(fileId, \{ tus: \{ uploadUrl: body\.uploadUrl \} \}\)/);
  assert.match(client, />Your name</);
  assert.match(client, />Game date</);
  assert.match(client, />Opponent</);
  assert.match(client, />Our score</);
  assert.match(client, />Their score</);
  assert.match(client, /type="date"/);
  assert.match(client, /churchToday/);
  assert.match(client, /formatFilmGameLine/);
  assert.match(client, /gameDate: snapshot\.gameDate/);
  const inbox = readFileSync(join(import.meta.dirname, "../../app/portal/film/FilmInbox.tsx"), "utf8");
  assert.match(inbox, /formatFilmInboxHeading/);
  assert.match(inbox, />Play</);
  assert.match(inbox, /playsInline/);
  assert.match(inbox, />\s*Edit\s*</);
  assert.match(inbox, /"Save"/);
  assert.match(inbox, />\s*Cancel\s*</);
  assert.match(inbox, /updateFilmGameFields/);
  assert.match(inbox, /updateFilmPlaylistOverride/);
  assert.match(inbox, /Retry playlist/);
  assert.match(inbox, /Missing:/);
  const inboxCss = readFileSync(join(import.meta.dirname, "../../app/portal/film/inbox.module.css"), "utf8");
  assert.match(inboxCss, /\.input\[type="date"\][\s\S]*-webkit-appearance:\s*none/);
  assert.match(inboxCss, /::-webkit-date-and-time-value[\s\S]*text-align:\s*left/);
  const actions = readFileSync(join(import.meta.dirname, "../../lib/film/admin-actions.ts"), "utf8");
  assert.match(actions, /export async function updateFilmGameFields[\s\S]*?requireFilmManage\(\)/);
  assert.match(actions, /emptyDate: "error"/);
  assert.match(route, /gameDate: body\.gameDate/);
  assert.match(route, /ourScore: checked\.ourScore/);
  const uploads = readFileSync(join(import.meta.dirname, "../../lib/film/uploads.ts"), "utf8");
  assert.match(uploads, /updateFilmUploadGame/);
  assert.match(uploads, /game_date: fields\.gameDate/);
  assert.match(uploads, /game_date: input\.gameDate/);
  assert.match(uploads, /our_score: input\.ourScore/);
  assert.match(uploads, /FILM_UPLOAD_COLUMNS/);
  assert.match(uploads, /game_date, opponent, our_score, their_score, youtube_status/);
  assert.match(uploads, /youtube_playlist_id, youtube_playlist_status/);
  assert.equal(client.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), false);
  assert.equal(client.includes("sb_publishable"), false);
  assert.doesNotMatch(client, /onBeforeRequest/);
  assert.equal(client.includes("filmGatewayJwt"), false);
  assert.doesNotMatch(client, /\bauthorization\s*:/i);
  assert.doesNotMatch(client, /\bapikey\s*:/i);
  assert.match(mint, /createSignedUploadUrl/);
  assert.match(mint, /createSignedTusUpload/);
  assert.equal(mint.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.match(route, /filmStorage\(\)\.mintUpload/);
  assert.match(route, /token: minted\.token/);
  assert.match(route, /uploadUrl: minted\.uploadUrl/);
  assert.equal(route.includes("gatewayJwt"), false);
  assert.match(settings, /suggestFilmCode\(team\.id\)/);
  assert.match(settings, /toLowerCase\(\)/);
  assert.match(settings, /Generate code/);
  assert.match(settings, /YouTube playlist/);
  assert.match(settings, /Save playlist/);
  assert.match(settings, /Or pick from the channel/);
  assert.match(settings, /saveFilmTeamPlaylist/);
  assert.match(settings, /saveFilmTeamTemplate/);
});

test("guest Game date CSS constrains the iOS Safari native date field", () => {
  const css = readFileSync(join(import.meta.dirname, "../../app/film/film.module.css"), "utf8");
  assert.match(css, /\.card\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.field\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.input\s*\{[\s\S]*?box-sizing:\s*border-box/);
  assert.match(css, /\.input\s*\{[\s\S]*?height:\s*52px/);
  assert.match(css, /\.input\s*\{[\s\S]*?line-height:\s*52px/);
  assert.match(css, /\.input\[type="date"\][\s\S]*-webkit-appearance:\s*none/);
  assert.match(css, /\.input\[type="date"\][\s\S]*display:\s*block/);
  assert.match(css, /\.input\[type="date"\][\s\S]*width:\s*100%/);
  assert.match(css, /\.input\[type="date"\][\s\S]*max-width:\s*100%/);
  assert.match(css, /\.input\[type="date"\][\s\S]*box-sizing:\s*border-box/);
  assert.match(css, /\.input\[type="date"\][\s\S]*min-width:\s*0/);
  assert.match(css, /\.input\[type="date"\][\s\S]*line-height:\s*52px/);
  assert.match(css, /::-webkit-date-and-time-value[\s\S]*text-align:\s*left/);
  assert.match(css, /::-webkit-date-and-time-value[\s\S]*margin:\s*0/);
});

test("guest upload status: all-done, size, and local finish time", () => {
  assert.equal(allUploadsFinished([]), false);
  assert.equal(allUploadsFinished([{ status: "uploading" }]), false);
  assert.equal(allUploadsFinished([{ status: "done" }, { status: "error" }]), false);
  assert.equal(allUploadsFinished([{ status: "done" }, { status: "done" }]), true);
  assert.equal(formatBytes(12 * 1024 * 1024), "12.0 MB");
  assert.match(formatFinishTime(Date.now(), "en-US"), /\d{1,2}:\d{2}/);
  assert.equal(isLargeFilmFile(4 * 1024 * 1024 * 1024), false);
  assert.equal(isLargeFilmFile(4 * 1024 * 1024 * 1024 + 1), true);
});

test("the per-IP token mint cap trips after the limit", () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < TOKEN_LIMIT.max; i++) {
    assert.equal(rateLimitTake(key, TOKEN_LIMIT, 1_000).ok, true);
  }
  const blocked = rateLimitTake(key, TOKEN_LIMIT, 1_000);
  assert.equal(blocked.ok, false);
  assert.equal(rateLimitTake(key, TOKEN_LIMIT, 1_000 + TOKEN_LIMIT.windowMs + 1).ok, true);
});
