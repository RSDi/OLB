// Which part of a game a video is (0181): a half, a quarter or overtime.
// Null is the whole game, or the uploader didn't say. Pure, so the client,
// the server and tests share it. Keep the codes in step with the check in
// supabase/migrations/0181_film_game_parts.sql.

export const FILM_PARTS = [
  { code: "h1", label: "1st half" },
  { code: "h2", label: "2nd half" },
  { code: "q1", label: "1st quarter" },
  { code: "q2", label: "2nd quarter" },
  { code: "q3", label: "3rd quarter" },
  { code: "q4", label: "4th quarter" },
  { code: "ot", label: "Overtime" },
  { code: "ot2", label: "2nd overtime" },
  { code: "ot3", label: "3rd overtime" },
] as const;

export type FilmPart = (typeof FILM_PARTS)[number]["code"];

const ORDER: Record<string, number> = { h1: 10, q1: 11, q2: 12, h2: 20, q3: 21, q4: 22, ot: 30, ot2: 31, ot3: 32 };

/** "h2" → "2nd half"; null for the whole game or anything unknown. */
export function filmPartLabel(code: string | null | undefined): string | null {
  return FILM_PARTS.find((p) => p.code === code)?.label ?? null;
}

/**
 * A part from a form or request. Blank means the whole game (null);
 * anything not on the list is refused.
 */
export function parseFilmPart(raw: unknown): { ok: true; part: FilmPart | null } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, part: null };
  const found = FILM_PARTS.find((p) => p.code === raw);
  return found ? { ok: true, part: found.code } : { ok: false, error: "Pick which part of the game this is." };
}

/**
 * Game order: halves and quarters in play order, then overtimes, then
 * videos that didn't say, by upload time.
 */
export function compareFilmParts(
  a: { part?: string | null; createdAt: string },
  b: { part?: string | null; createdAt: string }
): number {
  const oa = a.part ? ORDER[a.part] ?? 50 : 90;
  const ob = b.part ? ORDER[b.part] ?? 50 : 90;
  if (oa !== ob) return oa - ob;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}
