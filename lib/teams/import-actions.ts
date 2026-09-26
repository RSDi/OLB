"use server";
import { createClient } from "../supabase/server";
import { requireTeamManager } from "./guard";
import type { ParsedTeam } from "./types";

// Replaces the season's teams/players/coaches with the imported set, and records
// an audit row. Order-safe: teams are matched back to their players/coaches by
// sort_order. Re-importing fully replaces the prior roster for this season.
export async function importBoard(
  teams: ParsedTeam[],
  filename: string,
): Promise<{ teams: number; players: number; coaches: number }> {
  await requireTeamManager();
  const db = await createClient();

  const { data: board } = await db.from("olb_boards").select("id").eq("season", "2026-2027").maybeSingle();
  if (!board) throw new Error("Season board not found — run the migration first.");
  const boardId = board.id as string;

  // Clear the current roster for a clean replace.
  await db.from("olb_players").delete().eq("board_id", boardId);
  await db.from("olb_coaches").delete().eq("board_id", boardId);
  await db.from("olb_teams").delete().eq("board_id", boardId);

  const teamRows = teams.map((t, i) => ({
    board_id: boardId,
    name: t.name,
    age_group: t.age_group,
    color: t.color,
    grade_label: t.grade_label,
    division: t.division,
    practice_times: t.practice_times,
    sort_order: i,
    raw_header: t.raw_header,
  }));

  const { data: inserted, error: te } = await db.from("olb_teams").insert(teamRows).select("id, sort_order");
  if (te || !inserted) throw new Error(te?.message ?? "Failed to insert teams.");
  const idByIdx = new Map<number, string>(inserted.map((r) => [r.sort_order as number, r.id as string]));

  const playerRows = teams.flatMap((t, i) =>
    t.players.map((p, j) => ({
      board_id: boardId,
      team_id: idByIdx.get(i) ?? null,
      full_name: p.full_name,
      dob: p.dob,
      grade: p.grade,
      sort_order: j,
      import_flag: p.flag,
    })),
  );
  const coachRows = teams.flatMap((t, i) =>
    t.coaches.map((name, j) => ({
      board_id: boardId,
      team_id: idByIdx.get(i) ?? null,
      name,
      sort_order: j,
    })),
  );

  if (playerRows.length) {
    const { error } = await db.from("olb_players").insert(playerRows);
    if (error) throw new Error(error.message);
  }
  if (coachRows.length) {
    const { error } = await db.from("olb_coaches").insert(coachRows);
    if (error) throw new Error(error.message);
  }

  const summary = { teams: teams.length, players: playerRows.length, coaches: coachRows.length };
  await db.from("olb_import_batches").insert({ board_id: boardId, filename, summary });
  return summary;
}
