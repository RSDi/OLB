"use server";
// The roster, from the Directory: putting a player on a team, Edit player,
// and taking a player off the roster. For anyone with the Registrations
// permission (0102); RLS and remove_olb_player() check it again.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requireRegistrations } from "../auth/guards";
import { cleanPlayerEdit, type PlayerEdit } from "./roster-logic";

type Result = { error?: string };

function refresh() {
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/payments");
}

// Puts a player on a team, or back under No team yet (null).
export async function placePlayer(playerId: string, teamId: string | null): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_players")
    .update({ team_id: teamId || null, updated_at: new Date().toISOString() })
    .eq("id", playerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That player couldn't be moved. Refresh the page and try again." };
  refresh();
  return {};
}

export async function updatePlayer(playerId: string, input: PlayerEdit): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const clean = cleanPlayerEdit(input);
  if ("error" in clean) return { error: clean.error };
  const db = await createClient();
  const { data, error } = await db
    .from("olb_players")
    .update({ ...clean.value, updated_at: new Date().toISOString() })
    .eq("id", playerId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "That player couldn't be saved. Refresh the page and try again." };
  refresh();
  return {};
}

// Takes a player off the roster for good, with their parent links and
// requirement check-offs. Refused while they have charges or payments that
// aren't voided.
export async function removePlayer(playerId: string): Promise<Result> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const db = await createClient();
  const { error } = await db.rpc("remove_olb_player", { p_player_id: playerId });
  if (error) return { error: error.message };
  refresh();
  return {};
}
