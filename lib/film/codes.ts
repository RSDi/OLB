// Hashed family upload codes. Plaintext is shown once when an admin sets or
// rotates a code; only the hash is stored. Reveal is not possible.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const FILM_CODE_MIN = 4;
export const FILM_CODE_MAX = 20;
export const FILM_CODE_RE = /^[a-z0-9]+$/;

export function normalizeFilmCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function generateFilmCode(): string {
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

// "14U White" / age 14U → white14. Letters and digits only, lowercase.
export function suggestTeamWordCode(input: { name?: string | null; ageGroup?: string | null; label?: string | null }): string {
  const name = (input.name ?? "").trim();
  const label = (input.label ?? "").trim();
  const ageGroup = (input.ageGroup ?? "").trim();
  const hay = `${ageGroup} ${label || name}`.toLowerCase();
  const ageMatch = hay.match(/\b(\d{1,2})\s*u\b/) || hay.match(/\b(\d{2})\b/);
  const age = ageMatch?.[1] ?? "";
  let word = name
    .toLowerCase()
    .replace(/\b\d{1,2}\s*u\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
  if (age && word.startsWith(age)) word = word.slice(age.length);
  if (!word) {
    word = (label || name)
      .toLowerCase()
      .replace(/\b\d{1,2}\s*u\b/g, " ")
      .replace(/[^a-z0-9]+/g, "");
    if (age && word.startsWith(age)) word = word.slice(age.length);
  }
  const combined = `${word}${age}`.replace(/[^a-z0-9]/g, "").slice(0, FILM_CODE_MAX);
  return combined;
}

export function filmCodeProblem(raw: string): string | null {
  const code = normalizeFilmCode(raw);
  if (code.length < FILM_CODE_MIN) return `Use at least ${FILM_CODE_MIN} letters or numbers.`;
  if (code.length > FILM_CODE_MAX) return `Keep it to ${FILM_CODE_MAX} letters or numbers.`;
  if (!FILM_CODE_RE.test(code)) return "Use letters and numbers only (no spaces or punctuation).";
  return null;
}

export function pickUniqueFilmCode(base: string, taken: (code: string) => boolean): string {
  const stem = normalizeFilmCode(base).replace(/[^a-z0-9]/g, "").slice(0, FILM_CODE_MAX);
  if (stem && !filmCodeProblem(stem) && !taken(stem)) return stem;
  const root = (stem || "team").slice(0, 16);
  for (let n = 2; n < 100; n++) {
    const candidate = `${root}${n}`.slice(0, FILM_CODE_MAX);
    if (!filmCodeProblem(candidate) && !taken(candidate)) return candidate;
  }
  for (let i = 0; i < 8; i++) {
    const gen = generateFilmCode();
    if (!taken(gen)) return gen;
  }
  return generateFilmCode();
}

export function filmCodeUsedByOther(
  rows: { id: string; codeHash: string | null }[],
  exceptId: string,
  code: string
): boolean {
  return rows.some((row) => row.id !== exceptId && filmCodeMatches(row.codeHash, row.id, code));
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
