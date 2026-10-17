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
import { filmGatewayJwt, isCompactJws, tusSignedHeaders } from "../../lib/film/tus.ts";
import { TOKEN_LIMIT, rateLimitTake } from "../../lib/film/rate-limit.ts";
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

test("signed TUS headers send a compact-JWS bearer, never a publishable key", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.sig";
  const token = "eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJnYW1lLWZpbG0vYSJ9.tok";
  assert.equal(isCompactJws(jwt), true);
  assert.equal(isCompactJws("sb_publishable_abc"), false);
  assert.equal(isCompactJws(""), false);
  assert.deepEqual(tusSignedHeaders(token, jwt), {
    "x-signature": token,
    "x-upsert": "false",
    authorization: `Bearer ${jwt}`,
    apikey: jwt,
  });
  assert.deepEqual(tusSignedHeaders(token, "sb_publishable_abc"), {
    "x-signature": token,
    "x-upsert": "false",
    authorization: `Bearer ${token}`,
    apikey: token,
  });
  assert.equal(tusSignedHeaders("not-a-jwt", "sb_publishable_abc").authorization, undefined);
  assert.equal(filmGatewayJwt({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc" }), "");
  assert.equal(
    filmGatewayJwt({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_abc",
      NEXT_PUBLIC_SUPABASE_LEGACY_ANON_KEY: jwt,
    }),
    jwt
  );
});

test("the guest uploader mints a signed token and does not send the publishable key", () => {
  const client = readFileSync(join(import.meta.dirname, "../../app/t/[team]/TeamUpload.tsx"), "utf8");
  const mint = readFileSync(join(import.meta.dirname, "../../lib/film/supabase-storage.ts"), "utf8");
  const route = readFileSync(join(import.meta.dirname, "../../app/film/upload-token/route.ts"), "utf8");
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/FilmSettingsTab.tsx"), "utf8");
  assert.match(client, /tusSignedHeaders/);
  assert.match(client, /allowedFileTypes: \["video\/\*".*\.mov/);
  assert.match(client, /maxFileSize: MAX_UPLOAD_BYTES/);
  assert.match(client, /Phone \.mov files are fine\. Up to 20 GB each\./);
  assert.equal(client.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"), false);
  assert.equal(client.includes("sb_publishable"), false);
  assert.match(mint, /createSignedUploadUrl/);
  assert.match(mint, /filmGatewayJwt/);
  assert.equal(mint.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.match(route, /filmStorage\(\)\.mintUpload/);
  assert.match(route, /token: minted\.token/);
  assert.match(route, /gatewayJwt: minted\.gatewayJwt/);
  assert.match(settings, /suggestFilmCode\(team\.id\)/);
  assert.match(settings, /toLowerCase\(\)/);
  assert.match(settings, /Generate code/);
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
