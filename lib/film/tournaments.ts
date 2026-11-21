// Tournament choices for a game on Film: the HS Schedule's weekends for the
// team (by date) plus names already typed on Film. Pure, so tests and the
// client share it. The server read is in tournaments-data.ts.

import { formatDateRange } from "./watch.ts";

export type ScheduledTournament = { name: string; startsOn: string; endsOn: string };
export type TournamentChoice = { name: string; dates: string | null };

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The scheduled tournament on this game date, or null. */
export function tournamentForDate(list: ScheduledTournament[], gameDate: string | null | undefined): ScheduledTournament | null {
  if (!gameDate) return null;
  return list.find((t) => t.startsOn <= gameDate && gameDate <= t.endsOn) ?? null;
}

/**
 * The dropdown's options: the schedule's tournaments newest first, with
 * their dates, then names used on Film that the schedule doesn't have.
 */
export function tournamentChoices(scheduled: ScheduledTournament[], used: string[]): TournamentChoice[] {
  const out: TournamentChoice[] = [];
  const seen = new Set<string>();
  for (const t of [...scheduled].sort((a, b) => (a.startsOn < b.startsOn ? 1 : a.startsOn > b.startsOn ? -1 : 0))) {
    const k = key(t.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: t.name.trim(), dates: formatDateRange(t.startsOn, t.endsOn) });
  }
  for (const name of used) {
    const k = key(name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: name.trim(), dates: null });
  }
  return out;
}

/** The choice a typed name matches, ignoring case and extra spaces. */
export function matchTournament(choices: TournamentChoice[], value: string): TournamentChoice | null {
  const k = key(value);
  return k ? choices.find((c) => key(c.name) === k) ?? null : null;
}
