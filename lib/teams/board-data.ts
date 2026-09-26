import { createClient } from "../supabase/server";
import type { OlbBoardData, OlbTeam, OlbPlayer, OlbCoach } from "./types";

// Loads the full board for a season. Used by the board page (server component).
export async function loadBoard(season = "2026-2027"): Promise<OlbBoardData | null> {
  const db = await createClient();
  const { data: board } = await db
    .from("olb_boards")
    .select("id, season, name")
    .eq("season", season)
    .maybeSingle();
  if (!board) return null;

  const [{ data: teams }, { data: players }, { data: coaches }] = await Promise.all([
    db.from("olb_teams").select("*").eq("board_id", board.id).order("sort_order").order("name"),
    db.from("olb_players").select("*").eq("board_id", board.id).order("sort_order").order("full_name"),
    db.from("olb_coaches").select("*").eq("board_id", board.id).order("sort_order").order("name"),
  ]);

  return {
    board: board as OlbBoardData["board"],
    teams: (teams ?? []) as OlbTeam[],
    players: (players ?? []) as OlbPlayer[],
    coaches: (coaches ?? []) as OlbCoach[],
  };
}
