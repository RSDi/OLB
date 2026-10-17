// Signed cookie that proves this browser unlocked a team's upload page.
// HMAC with FILM_SESSION_SECRET; compared in constant time. Unset secret
// fails closed — nobody unlocks. The team's film_code_version is in the
// payload so rotating the code invalidates outstanding cookies.

import { createHmac, timingSafeEqual } from "node:crypto";
import { filmCodeMatches } from "./codes.ts";
import { FILM_COOKIE, FILM_SESSION_MAX_AGE_S } from "./types.ts";
import type { FilmTeamRow } from "./teams.ts";

export { FILM_COOKIE, FILM_SESSION_MAX_AGE_S };

export function codesMatch(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted.trim());
  const b = Buffer.from(expected.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function checkFilmTeamCode(team: FilmTeamRow | null, submitted: unknown): "ok" | "wrong" | "unset" {
  if (!team || !team.enabled || !team.codeHash) return "unset";
  if (typeof submitted !== "string" || !submitted.trim()) return "wrong";
  return filmCodeMatches(team.codeHash, team.id, submitted) ? "ok" : "wrong";
}

function sessionSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.FILM_SESSION_SECRET?.trim();
  return s || null;
}

function mac(secret: string, slug: string, version: number, exp: number): string {
  return createHmac("sha256", secret).update(`v2:${slug}:${version}:${exp}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function encodeFilmSession(
  slug: string,
  version: number,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const exp = now + FILM_SESSION_MAX_AGE_S * 1000;
  return `${slug}.${version}.${exp}.${mac(secret, slug, version, exp)}`;
}

export function parseFilmSession(
  raw: string | null | undefined,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env
): { slug: string; version: number } | null {
  if (!raw) return null;
  const secret = sessionSecret(env);
  if (!secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [slug, versionRaw, expRaw, sig] = parts;
  const version = Number(versionRaw);
  const exp = Number(expRaw);
  if (!slug || !Number.isSafeInteger(version) || version < 1) return null;
  if (!Number.isSafeInteger(exp) || exp <= now) return null;
  if (!same(sig ?? "", mac(secret, slug, version, exp))) return null;
  return { slug, version };
}

export function sessionMatchesTeam(
  session: { slug: string; version: number } | null,
  team: FilmTeamRow | null
): boolean {
  if (!session || !team) return false;
  return team.enabled && team.hasCode && team.slug === session.slug && team.codeVersion === session.version;
}

export function filmCookieOptions(secure: boolean, maxAge = FILM_SESSION_MAX_AGE_S) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}
