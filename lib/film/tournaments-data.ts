// The HS Schedule's tournaments for Film's Tournament dropdown: weekends with
// an event name, in the seasons where the team has a column (hs_levels).
// Read through the admin client after the Film page's own permission check.

import { createAdminClient } from "../supabase/admin.ts";
import type { ScheduledTournament } from "./tournaments.ts";
import { EVENT_NAME_MAX } from "./watch.ts";

const SKIP_STATUS = new Set(["canceled", "off"]);

export async function listScheduledTournaments(teamIds: string[]): Promise<Record<string, ScheduledTournament[]>> {
  const out: Record<string, ScheduledTournament[]> = {};
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const admin = createAdminClient();
  const { data: levels, error } = await admin.from("hs_levels").select("team_id, season_id").in("team_id", ids);
  if (error) throw new Error(error.message);
  const seasonsByTeam = new Map<string, Set<string>>();
  for (const l of (levels as { team_id: string; season_id: string }[] | null) ?? []) {
    if (!seasonsByTeam.has(l.team_id)) seasonsByTeam.set(l.team_id, new Set());
    seasonsByTeam.get(l.team_id)!.add(l.season_id);
  }
  const seasons = [...new Set([...seasonsByTeam.values()].flatMap((s) => [...s]))];
  if (seasons.length === 0) return out;
  const { data: weekends, error: wError } = await admin
    .from("hs_weekends")
    .select("season_id, starts_on, ends_on, event, status")
    .in("season_id", seasons)
    .order("starts_on", { ascending: false });
  if (wError) throw new Error(wError.message);
  const rows = (weekends as { season_id: string; starts_on: string; ends_on: string; event: string; status: string }[] | null) ?? [];
  for (const [teamId, teamSeasons] of seasonsByTeam) {
    out[teamId] = rows
      .filter((w) => teamSeasons.has(w.season_id) && w.event?.trim() && !SKIP_STATUS.has(w.status))
      .map((w) => ({ name: w.event.trim().replace(/\s+/g, " ").slice(0, EVENT_NAME_MAX).trim(), startsOn: w.starts_on, endsOn: w.ends_on }));
  }
  return out;
}
