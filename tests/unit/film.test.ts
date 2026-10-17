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
  cleanUploaderName,
  isVideoFile,
  validateUploadInput,
} from "../../lib/film/validation.ts";
import { canManageFilm, canViewFilm, hasPermission, type MemberLike } from "../../lib/auth/permissions.ts";
import { tusEndpoint } from "../../lib/film/supabase-storage.ts";
import { isCompactJws, tusSignedHeaders, tusUploadMetadata } from "../../lib/film/tus.ts";
import { TOKEN_LIMIT, rateLimitTake } from "../../lib/film/rate-limit.ts";
import { allUploadsFinished, formatBytes, formatFinishTime } from "../../lib/film/guest-status.ts";
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
  }), { ok: true, uploaderName: "Pat", filename: "game.mov", contentType: "video/quicktime", sizeBytes: 12_000_000 });
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
  assert.match(client, /✓ Uploaded/);
  assert.match(client, /All videos uploaded — you can close this page\./);
  assert.match(client, /Keep this page open and keep your phone plugged in/);
  assert.match(client, />\s*Retry\s*</);
  assert.match(client, /allUploadsFinished/);
  assert.match(client, /retryUpload/);
  assert.match(client, /setFileState\(fileId, \{ tus: \{ uploadUrl: body\.uploadUrl \} \}\)/);
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
});

test("guest upload status: all-done, size, and local finish time", () => {
  assert.equal(allUploadsFinished([]), false);
  assert.equal(allUploadsFinished([{ status: "uploading" }]), false);
  assert.equal(allUploadsFinished([{ status: "done" }, { status: "error" }]), false);
  assert.equal(allUploadsFinished([{ status: "done" }, { status: "done" }]), true);
  assert.equal(formatBytes(12 * 1024 * 1024), "12.0 MB");
  assert.match(formatFinishTime(Date.now(), "en-US"), /\d{1,2}:\d{2}/);
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
