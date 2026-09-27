"use server";
import { createClient } from "../supabase/server";
import { requireTeamManager } from "./guard";
import type { ParsedTeam } from "./types";

// Replaces the season's teams and coaches with the imported set, puts players
// on their imported teams, and records an audit row. Teams are matched back to
// their players/coaches by sort_order.
//
// Players are matched, not replaced: a player already on the board (same name,
// and birthdate when both have one) keeps their row, with its registration
// details and parent links, and just moves to the imported team. Players the
// sheet doesn't list go back to Unassigned if they came from a registration,
// and are removed if they only ever came from a roster import.
export async function importBoard(
  teams: ParsedTeam[],
  filename: string,
): Promise<{ teams: number; players: number; coaches: number }> {
  await requireTeamManager();
  const db = await createClient();

  const { data: board } = await db.from("olb_boards").select("id").eq("season", "2026-2027").maybeSingle();
  if (!board) throw new Error("Season board not found — run the migration first.");
  const boardId = board.id as string;

  const { data: existingRows, error: pe } = await db
    .from("olb_players")
    .select("id, full_name, dob, registered_at")
    .eq("board_id", boardId);
  if (pe) throw new Error(pe.message);
  const unmatched = (existingRows ?? []) as { id: string; full_name: string; dob: string | null; registered_at: string | null }[];

  // Clearing teams drops every player back to Unassigned (team_id is
  // on delete set null).
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

  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const takeMatch = (name: string, dob: string | null) => {
    const same = unmatched.filter((p) => norm(p.full_name) === norm(name));
    const hit = same.find((p) => !!dob && p.dob === dob) ?? same.find((p) => !dob || !p.dob);
    if (hit) unmatched.splice(unmatched.indexOf(hit), 1);
    return hit ?? null;
  };

  const newPlayers: Record<string, unknown>[] = [];
  let playerCount = 0;
  for (const [i, t] of teams.entries()) {
    for (const [j, p] of t.players.entries()) {
      playerCount++;
      const row = {
        team_id: idByIdx.get(i) ?? null,
        grade: p.grade,
        sort_order: j,
        import_flag: p.flag,
      };
      const match = takeMatch(p.full_name, p.dob);
      if (match) {
        const { error } = await db
          .from("olb_players")
          .update({ ...row, dob: p.dob ?? match.dob })
          .eq("id", match.id);
        if (error) throw new Error(error.message);
      } else {
        newPlayers.push({ ...row, board_id: boardId, full_name: p.full_name, dob: p.dob });
      }
    }
  }
  const coachRows = teams.flatMap((t, i) =>
    t.coaches.map((name, j) => ({
      board_id: boardId,
      team_id: idByIdx.get(i) ?? null,
      name,
      sort_order: j,
    })),
  );

  if (newPlayers.length) {
    const { error } = await db.from("olb_players").insert(newPlayers);
    if (error) throw new Error(error.message);
  }
  const rosterOnly = unmatched.filter((p) => !p.registered_at).map((p) => p.id);
  if (rosterOnly.length) {
    const { error } = await db.from("olb_players").delete().in("id", rosterOnly);
    if (error) throw new Error(error.message);
  }
  if (coachRows.length) {
    const { error } = await db.from("olb_coaches").insert(coachRows);
    if (error) throw new Error(error.message);
  }

  const summary = { teams: teams.length, players: playerCount, coaches: coachRows.length };
  await db.from("olb_import_batches").insert({ board_id: boardId, filename, summary });
  return summary;
}
