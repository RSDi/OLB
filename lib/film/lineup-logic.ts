// Pure lineup helpers. Keep this free of the admin client so unit tests
// can pin the fallback without booting Supabase.

export type FilmRosterPlayer = { id: string; name: string };

export function normalizeFilmOpponent(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

export function filmLineupKey(
  teamId: string | null | undefined,
  gameDate: string | null | undefined,
  opponent: unknown
): string | null {
  if (!teamId || !gameDate) return null;
  return `${teamId}|${gameDate}|${normalizeFilmOpponent(opponent)}`;
}

export function pickFilmPlayerNames(
  lineupNames: string[] | null | undefined,
  rosterNames: string[]
): string[] {
  const lineup = (lineupNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (lineup.length > 0) return lineup;
  return rosterNames.map((name) => name.trim()).filter(Boolean);
}

export function parseFilmLineupPlayerIds(raw: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw == null) return { ok: true, ids: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Pick the players from the list." };
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !value.trim()) {
      return { ok: false, error: "Pick the players from the list." };
    }
    const id = value.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ok: true, ids };
}
