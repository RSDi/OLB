// Signed cookie that proves this browser unlocked a team's upload page.
// HMAC with FILM_SESSION_SECRET; compared in constant time. Unset secret
// fails closed — nobody unlocks.

import { createHmac, timingSafeEqual } from "node:crypto";
import { FILM_COOKIE, FILM_SESSION_MAX_AGE_S } from "./types.ts";
import { teamCode } from "./teams.ts";

export { FILM_COOKIE, FILM_SESSION_MAX_AGE_S };

export function codesMatch(submitted: string, expected: string): boolean {
  const a = Buffer.from(submitted.trim());
  const b = Buffer.from(expected.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function checkTeamCode(
  slug: string,
  submitted: unknown,
  env: Record<string, string | undefined> = process.env
): "ok" | "wrong" | "unset" {
  const expected = teamCode(slug, env);
  if (!expected) return "unset";
  if (typeof submitted !== "string" || !submitted.trim()) return "wrong";
  return codesMatch(submitted, expected) ? "ok" : "wrong";
}

function sessionSecret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.FILM_SESSION_SECRET?.trim();
  return s || null;
}

function mac(secret: string, slug: string, exp: number): string {
  return createHmac("sha256", secret).update(`v1:${slug}:${exp}`).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function encodeFilmSession(
  slug: string,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env
): string | null {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const exp = now + FILM_SESSION_MAX_AGE_S * 1000;
  return `${slug}.${exp}.${mac(secret, slug, exp)}`;
}

export function parseFilmSession(
  raw: string | null | undefined,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env
): string | null {
  if (!raw) return null;
  const secret = sessionSecret(env);
  if (!secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [slug, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!slug || !Number.isSafeInteger(exp) || exp <= now) return null;
  if (!same(sig, mac(secret, slug, exp))) return null;
  return slug;
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
