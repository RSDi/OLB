import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkTeamCode,
  codesMatch,
  encodeFilmSession,
  parseFilmSession,
} from "../../lib/film/session.ts";
import { configuredFilmTeams, filmTeam, filmTeams, teamCode, teamCodeEnvKey } from "../../lib/film/teams.ts";
import {
  cleanUploaderName,
  isVideoFile,
  validateUploadInput,
} from "../../lib/film/validation.ts";
import { canManageFilm, canViewFilm, hasPermission, type MemberLike } from "../../lib/auth/permissions.ts";
import { tusEndpoint } from "../../lib/film/supabase-storage.ts";
import { TOKEN_LIMIT, rateLimitTake } from "../../lib/film/rate-limit.ts";

const ENV = {
  FILM_SESSION_SECRET: "film-session-secret-for-tests-not-real",
  TEAM_CODE_14U_WHITE: "white-code",
  TEAM_CODE_14U_GOLD: "gold-code",
};

const approved = (perms: string[]): MemberLike => ({
  role: "member",
  status: "approved",
  permissions: perms,
});

test("team slugs map to TEAM_CODE_* env names", () => {
  assert.equal(teamCodeEnvKey("14u-white"), "TEAM_CODE_14U_WHITE");
  assert.equal(teamCodeEnvKey("14u-gold"), "TEAM_CODE_14U_GOLD");
  assert.equal(filmTeam("14u-white")?.label, "14U White");
  assert.equal(teamCode("14u-white", ENV), "white-code");
  assert.equal(teamCode("14u-white", {}), null);
  assert.deepEqual(
    configuredFilmTeams(ENV).map((t) => t.slug),
    ["14u-white", "14u-gold"]
  );
  assert.equal(configuredFilmTeams({}).length, 0);
});

test("FILM_TEAMS overrides the built-in list", () => {
  const teams = filmTeams({ FILM_TEAMS: "16u-black:16U Black, 14u-white:14U White" });
  assert.deepEqual(
    teams.map((t) => t.envKey),
    ["TEAM_CODE_16U_BLACK", "TEAM_CODE_14U_WHITE"]
  );
});

test("the shared team code is checked in constant time and fails closed", () => {
  assert.equal(checkTeamCode("14u-white", "white-code", ENV), "ok");
  assert.equal(checkTeamCode("14u-white", "nope", ENV), "wrong");
  assert.equal(checkTeamCode("14u-white", "white-code", {}), "unset");
  assert.equal(checkTeamCode("no-such-team", "x", ENV), "unset");
  assert.equal(codesMatch("abc", "abc"), true);
  assert.equal(codesMatch("abc", "abd"), false);
  assert.equal(codesMatch("ab", "abc"), false);
});

test("the film session cookie round-trips for one team and rejects junk", () => {
  const raw = encodeFilmSession("14u-white", 1_700_000_000_000, ENV);
  assert.ok(raw);
  assert.equal(parseFilmSession(raw, 1_700_000_000_000, ENV), "14u-white");
  assert.equal(parseFilmSession(raw, 1_700_000_000_000 + 8 * 24 * 60 * 60 * 1000, ENV), null);
  assert.equal(parseFilmSession("nope", 1_700_000_000_000, ENV), null);
  const other = encodeFilmSession("14u-gold", 1_700_000_000_000, ENV)!;
  assert.equal(parseFilmSession(other, 1_700_000_000_000, ENV), "14u-gold");
  assert.equal(parseFilmSession(raw, 1_700_000_000_000, { FILM_SESSION_SECRET: "other" }), null);
  assert.equal(encodeFilmSession("14u-white", 1, {}), null);
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

test("the TUS endpoint uses the direct storage hostname", () => {
  assert.equal(
    tusEndpoint("https://abcd.supabase.co"),
    "https://abcd.storage.supabase.co/storage/v1/upload/resumable"
  );
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
