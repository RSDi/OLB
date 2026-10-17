// Game date / opponent / score on a film upload. Shared by the guest form
// (validation + the ✓ Uploaded card) and the coach Film inbox.

import { churchToday } from "../dates/today.ts";

export const OPPONENT_MAX = 80;
export const SCORE_MAX = 999;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type FilmGameFields = {
  gameDate: string;
  opponent: string | null;
  ourScore: number | null;
  theirScore: number | null;
};

export function cleanGameDate(raw: unknown, today = churchToday()): string | null {
  if (raw == null) return today;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return today;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function cleanOpponent(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw == null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const value = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (value.length > OPPONENT_MAX) return { ok: false };
  return { ok: true, value: value || null };
}

export function cleanScore(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw == null || raw === "") return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw < 0 || raw > SCORE_MAX) return { ok: false };
    return { ok: true, value: raw };
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return { ok: true, value: null };
    if (!/^\d{1,3}$/.test(s)) return { ok: false };
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > SCORE_MAX) return { ok: false };
    return { ok: true, value: n };
  }
  return { ok: false };
}

export function parseFilmGameFields(
  input: {
    gameDate?: unknown;
    opponent?: unknown;
    ourScore?: unknown;
    theirScore?: unknown;
  },
  today = churchToday()
): ({ ok: true } & FilmGameFields) | { ok: false; error: string } {
  const gameDate = cleanGameDate(input.gameDate, today);
  if (!gameDate) return { ok: false, error: "Pick a game date." };
  const opponent = cleanOpponent(input.opponent);
  if (!opponent.ok) return { ok: false, error: "Keep the opponent name shorter." };
  const our = cleanScore(input.ourScore);
  const their = cleanScore(input.theirScore);
  if (!our.ok || !their.ok) return { ok: false, error: "Score has to be a number from 0 to 999." };
  return {
    ok: true,
    gameDate,
    opponent: opponent.value,
    ourScore: our.value,
    theirScore: their.value,
  };
}

export function formatFilmDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatFilmScore(
  our: number | null | undefined,
  their: number | null | undefined
): string | null {
  if (our == null && their == null) return null;
  if (our != null && their != null) return `${our}–${their}`;
  if (our != null) return `Us ${our}`;
  return `Them ${their}`;
}

export function formatFilmGameLine(input: {
  gameDate?: string | null;
  opponent?: string | null;
  ourScore?: number | null;
  theirScore?: number | null;
}): string | null {
  const parts: string[] = [];
  const date = formatFilmDate(input.gameDate);
  if (date) parts.push(date);
  if (input.opponent) parts.push(`vs ${input.opponent}`);
  const score = formatFilmScore(input.ourScore, input.theirScore);
  if (score) parts.push(score);
  return parts.length ? parts.join(" · ") : null;
}
