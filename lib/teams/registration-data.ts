// Registrations from the public form waiting on review, for the Directory's
// banner and its New registrations page. Runs under the viewer's own access:
// only people with the Registrations permission get rows back (0102).

import { createClient } from "../supabase/server";
import { matchRoster, type RegistrationExtra, type RosterMatch } from "./roster-logic";

export interface RosterPlayer {
  id: string;
  full_name: string;
  dob: string | null;
  team: { id: string; name: string; age_group: string | null } | null;
}

export interface PendingRegistration {
  id: string;
  board_id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  created_at: string;
  extra: RegistrationExtra;
  // A player already on the roster with this name.
  match: RosterMatch<RosterPlayer> | null;
}

export async function countPendingRegistrations(): Promise<number> {
  const db = await createClient();
  const { count } = await db
    .from("olb_registrations")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

// Oldest first, the order they came in.
export async function loadPendingRegistrations(): Promise<PendingRegistration[]> {
  const db = await createClient();
  const { data } = await db
    .from("olb_registrations")
    .select("id, board_id, first_name, last_name, dob, created_at, extra")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const regs = (data as Omit<PendingRegistration, "match">[] | null) ?? [];
  if (regs.length === 0) return [];

  const boards = [...new Set(regs.map((r) => r.board_id))];
  const { data: players } = await db
    .from("olb_players")
    .select("id, board_id, full_name, dob, team:olb_teams(id, name, age_group)")
    .in("board_id", boards);
  const roster = (players as unknown as (RosterPlayer & { board_id: string })[] | null) ?? [];

  return regs.map((r) => {
    // The drawn signature is a whole image; the page only says it's signed.
    const extra: RegistrationExtra & { signature_image?: unknown } = { ...r.extra };
    delete extra.signature_image;
    return { ...r, extra, match: matchRoster(r, roster.filter((p) => p.board_id === r.board_id)) };
  });
}
