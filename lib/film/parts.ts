// What a video of a game is (0183): a free note like "2nd half" or "Bench
// angle". Null is the whole game, or the uploader didn't say. Pure, so the
// client, the server and tests share it.
//
// The usual words still sort in play order (halves and quarters, then
// overtime); anything else keeps upload order after them.

export const FILM_PART_MAX = 60;

/** Offered as you type. Any other note is fine too. */
export const FILM_PART_SUGGESTIONS = [
  "1st half",
  "2nd half",
  "1st quarter",
  "2nd quarter",
  "3rd quarter",
  "4th quarter",
  "Overtime",
  "2nd overtime",
] as const;

// 0182 stored codes; a row read before 0183 ran may still have one.
const OLD_CODES: Record<string, string> = {
  h1: "1st half",
  h2: "2nd half",
  q1: "1st quarter",
  q2: "2nd quarter",
  q3: "3rd quarter",
  q4: "4th quarter",
  ot: "Overtime",
  ot2: "2nd overtime",
  ot3: "3rd overtime",
};

/** The note as people read it; null when there isn't one. */
export function filmPartLabel(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  return OLD_CODES[s] ?? s;
}

/** A note from a form or request: trimmed, spaces collapsed, blank = null. */
export function parseFilmPart(raw: unknown): { ok: true; part: string | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, part: null };
  if (typeof raw !== "string") return { ok: false, error: "Say what this video is in words." };
  const s = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!s) return { ok: true, part: null };
  if (s.length > FILM_PART_MAX) return { ok: false, error: `Keep what this video is under ${FILM_PART_MAX} characters.` };
  return { ok: true, part: OLD_CODES[s] ?? s };
}

const ORDINAL: Record<string, number> = { "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4 };

/** Where a note falls in a game: lower plays first; 90 = doesn't say. */
export function filmPartRank(raw: string | null | undefined): number {
  const s = filmPartLabel(raw)?.toLowerCase();
  if (!s) return 90;
  const half = /\b(1st|2nd|first|second)\s+half\b/.exec(s);
  if (half) return ORDINAL[half[1]] === 1 ? 10 : 20;
  const quarter = /\b(1st|2nd|3rd|4th|first|second|third|fourth)\s+(quarter|qtr)\b/.exec(s) ?? /\bq([1-4])\b/.exec(s);
  if (quarter) {
    const n = ORDINAL[quarter[1]] ?? Number(quarter[1]);
    return n <= 2 ? 10 + n : 20 + n;
  }
  if (/\b(ot|overtime)\b/.test(s)) {
    const nth = /\b(2nd|3rd|second|third)\s+(ot|overtime)\b/.exec(s);
    return 30 + (nth ? ORDINAL[nth[1]] : 0);
  }
  return 50;
}

/** Game order: the usual words in play order, then other notes, then none; ties by upload time. */
export function compareFilmParts(
  a: { part?: string | null; createdAt: string },
  b: { part?: string | null; createdAt: string }
): number {
  const oa = filmPartRank(a.part);
  const ob = filmPartRank(b.part);
  if (oa !== ob) return oa - ob;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}
