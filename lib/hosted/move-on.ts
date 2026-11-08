// After a score goes in: moves winners and losers on to the bracket games
// they feed, and fills placement seats from finished pools (0165). Shared by
// the portal's updateGame (as the planner) and the scorer's table (service
// role, after its PIN check). Not a "use server" file: it takes the client.

import type { SupabaseClient } from "@supabase/supabase-js";
import { advance } from "./logic";
import { GAME_COLUMNS, type HostedGame, type HostedTeam } from "./types";

export async function moveOn(db: SupabaseClient, weekendId: string): Promise<void> {
  const { data: t } = await db.from("hs_hosted_teams").select("id, division_id, pool, name").eq("weekend_id", weekendId);
  const teams = (t as Pick<HostedTeam, "id" | "division_id" | "pool" | "name">[] | null) ?? [];
  for (let pass = 0; pass < 6; pass++) {
    const { data } = await db.from("hs_hosted_games").select(GAME_COLUMNS).eq("weekend_id", weekendId);
    const moves = advance((data as HostedGame[] | null) ?? [], teams);
    if (moves.length === 0) break;
    await Promise.all(
      moves.map((m) =>
        db.from("hs_hosted_games").update({ home_team_id: m.home_team_id, away_team_id: m.away_team_id }).eq("id", m.id).eq("weekend_id", weekendId)
      )
    );
  }
}
