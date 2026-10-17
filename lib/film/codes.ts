// Hashed family upload codes. Plaintext is shown once when an admin sets or
// rotates a code; only the hash is stored. Reveal is not possible.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const FILM_CODE_MIN = 4;
export const FILM_CODE_MAX = 80;

export function normalizeFilmCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function generateFilmCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function filmCodeProblem(raw: string): string | null {
  const code = normalizeFilmCode(raw);
  if (code.length < FILM_CODE_MIN) return `Use at least ${FILM_CODE_MIN} characters.`;
  if (code.length > FILM_CODE_MAX) return `Keep it under ${FILM_CODE_MAX} characters.`;
  return null;
}

// v1.<salt>.<sha256(salt:teamId:code)> so a leaked table isn't a rainbow-table
// of the codes themselves. FILM_SESSION_SECRET is not mixed in: rotating that
// env var must not lock families out of the pages.
export function hashFilmCode(teamId: string, code: string, salt = randomBytes(16).toString("base64url")): string {
  const digest = createHash("sha256").update(`${salt}:${teamId}:${normalizeFilmCode(code)}`).digest("base64url");
  return `v1.${salt}.${digest}`;
}

export function filmCodeMatches(stored: string | null | undefined, teamId: string, submitted: unknown): boolean {
  if (!stored || typeof submitted !== "string") return false;
  const code = normalizeFilmCode(submitted);
  if (!code) return false;
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, salt] = parts;
  if (!salt) return false;
  const expected = Buffer.from(stored);
  const actual = Buffer.from(hashFilmCode(teamId, code, salt));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
