"use server";
import { createClient } from "../supabase/server";
import { requireTeamManager } from "./guard";

export async function movePlayer(playerId: string, toTeamId: string | null): Promise<void> {
  await requireTeamManager();
  const db = await createClient();
  const { error } = await db
    .from("olb_players")
    .update({ team_id: toTeamId, updated_at: new Date().toISOString() })
    .eq("id", playerId);
  if (error) throw new Error(error.message);
}

export async function moveCoach(coachId: string, toTeamId: string | null): Promise<void> {
  await requireTeamManager();
  const db = await createClient();
  const { error } = await db
    .from("olb_coaches")
    .update({ team_id: toTeamId, updated_at: new Date().toISOString() })
    .eq("id", coachId);
  if (error) throw new Error(error.message);
}

export async function updatePlayer(
  id: string,
  fields: { full_name: string; dob: string | null; grade: string | null },
): Promise<void> {
  await requireTeamManager();
  // Editing a player clears the import flag — the data has now been reviewed.
  const db = await createClient();
  const { error } = await db
    .from("olb_players")
    .update({
      full_name: fields.full_name,
      dob: fields.dob,
      grade: fields.grade,
      import_flag: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePlayer(id: string): Promise<void> {
  await requireTeamManager();
  const db = await createClient();
  const { error } = await db.from("olb_players").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCoach(id: string): Promise<void> {
  await requireTeamManager();
  const db = await createClient();
  const { error } = await db.from("olb_coaches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateTeam(
  id: string,
  fields: {
    name: string;
    color: string | null;
    grade_label: string | null;
    division: string | null;
    target_size: number | null;
    min_size: number | null;
    max_size: number | null;
  },
): Promise<void> {
  await requireTeamManager();
  const db = await createClient();
  const { error } = await db
    .from("olb_teams")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
