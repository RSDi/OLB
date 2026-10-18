// Who played a game. YouTube {players} uses that game's lineup when one
// exists, otherwise the season roster for the team.

import { createAdminClient } from "../supabase/admin.ts";
import {
  filmLineupKey,
  normalizeFilmOpponent,
  pickFilmPlayerNames,
  type FilmRosterPlayer,
} from "./lineup-logic.ts";

export type { FilmRosterPlayer } from "./lineup-logic.ts";
export {
  filmLineupKey,
  normalizeFilmOpponent,
  parseFilmLineupPlayerIds,
  pickFilmPlayerNames,
} from "./lineup-logic.ts";

export async function listTeamRosterPlayers(teamId: string): Promise<FilmRosterPlayer[]> {
  if (!teamId) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("olb_players")
    .select("id, full_name")
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true })
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as { id: string; full_name: string | null }[] | null) ?? [])
    .map((row) => ({ id: row.id, name: row.full_name?.trim() || "" }))
    .filter((row) => row.name);
}

export async function listTeamRosters(teamIds: string[]): Promise<Record<string, FilmRosterPlayer[]>> {
  const unique = [...new Set(teamIds.filter(Boolean))];
  const out: Record<string, FilmRosterPlayer[]> = {};
  await Promise.all(
    unique.map(async (id) => {
      out[id] = await listTeamRosterPlayers(id);
    })
  );
  return out;
}

export async function listGameLineupPlayerIds(
  teamId: string,
  gameDate: string,
  opponent: unknown
): Promise<string[]> {
  if (!teamId || !gameDate) return [];
  const admin = createAdminClient();
  const { data: lineup, error } = await admin
    .from("game_film_lineups")
    .select("id")
    .eq("team_id", teamId)
    .eq("game_date", gameDate)
    .eq("opponent", normalizeFilmOpponent(opponent))
    .maybeSingle();
  if (error) throw new Error(error.message);
  const lineupId = (lineup as { id: string } | null)?.id;
  if (!lineupId) return [];
  const { data: players, error: playersError } = await admin
    .from("game_film_lineup_players")
    .select("player_id, sort_order")
    .eq("lineup_id", lineupId)
    .order("sort_order", { ascending: true });
  if (playersError) throw new Error(playersError.message);
  return ((players as { player_id: string }[] | null) ?? []).map((row) => row.player_id);
}

export async function listGameLineupsByKey(teamIds: string[]): Promise<Record<string, string[]>> {
  const unique = [...new Set(teamIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const admin = createAdminClient();
  const { data: lineups, error } = await admin
    .from("game_film_lineups")
    .select("id, team_id, game_date, opponent")
    .in("team_id", unique);
  if (error) throw new Error(error.message);
  const rows = (lineups as { id: string; team_id: string; game_date: string; opponent: string }[] | null) ?? [];
  if (rows.length === 0) return {};
  const { data: players, error: playersError } = await admin
    .from("game_film_lineup_players")
    .select("lineup_id, player_id, sort_order")
    .in(
      "lineup_id",
      rows.map((row) => row.id)
    )
    .order("sort_order", { ascending: true });
  if (playersError) throw new Error(playersError.message);
  const byLineup = new Map<string, string[]>();
  for (const row of (players as { lineup_id: string; player_id: string }[] | null) ?? []) {
    const list = byLineup.get(row.lineup_id) ?? [];
    list.push(row.player_id);
    byLineup.set(row.lineup_id, list);
  }
  const out: Record<string, string[]> = {};
  for (const row of rows) {
    const key = filmLineupKey(row.team_id, row.game_date, row.opponent);
    if (key) out[key] = byLineup.get(row.id) ?? [];
  }
  return out;
}

export async function listGamePlayerNames(
  teamId: string,
  gameDate: string | null | undefined,
  opponent: unknown
): Promise<string[]> {
  const roster = await listTeamRosterPlayers(teamId);
  const rosterNames = roster.map((p) => p.name);
  if (!gameDate) return rosterNames;
  const playerIds = await listGameLineupPlayerIds(teamId, gameDate, opponent);
  if (playerIds.length === 0) return rosterNames;
  const byId = new Map(roster.map((p) => [p.id, p.name]));
  const leftover = playerIds.filter((id) => !byId.has(id));
  if (leftover.length > 0) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("olb_players").select("id, full_name").in("id", leftover);
    if (error) throw new Error(error.message);
    for (const row of (data as { id: string; full_name: string | null }[] | null) ?? []) {
      const name = row.full_name?.trim();
      if (name) byId.set(row.id, name);
    }
  }
  return pickFilmPlayerNames(
    playerIds.map((id) => byId.get(id) || "").filter(Boolean),
    rosterNames
  );
}

export async function saveGameLineup(
  teamId: string,
  gameDate: string,
  opponent: unknown,
  playerIds: string[]
): Promise<void> {
  if (!teamId || !gameDate) return;
  const admin = createAdminClient();
  const normalized = normalizeFilmOpponent(opponent);
  const now = new Date().toISOString();
  if (playerIds.length === 0) {
    const { error } = await admin
      .from("game_film_lineups")
      .delete()
      .eq("team_id", teamId)
      .eq("game_date", gameDate)
      .eq("opponent", normalized);
    if (error) throw new Error(error.message);
    return;
  }
  const { data: existing, error: findError } = await admin
    .from("game_film_lineups")
    .select("id")
    .eq("team_id", teamId)
    .eq("game_date", gameDate)
    .eq("opponent", normalized)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  let lineupId = (existing as { id: string } | null)?.id;
  if (!lineupId) {
    const { data, error } = await admin
      .from("game_film_lineups")
      .insert({ team_id: teamId, game_date: gameDate, opponent: normalized })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    lineupId = (data as { id: string }).id;
  } else {
    const { error } = await admin.from("game_film_lineups").update({ updated_at: now }).eq("id", lineupId);
    if (error) throw new Error(error.message);
  }
  const { error: clearError } = await admin.from("game_film_lineup_players").delete().eq("lineup_id", lineupId);
  if (clearError) throw new Error(clearError.message);
  const { error: insertError } = await admin.from("game_film_lineup_players").insert(
    playerIds.map((player_id, sort_order) => ({ lineup_id: lineupId, player_id, sort_order }))
  );
  if (insertError) throw new Error(insertError.message);
}
