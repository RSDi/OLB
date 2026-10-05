// The public Directory (/directory/<key>): this season's players and their
// parents, for anyone with the link, no login. Reads with the service role
// because there's no session to run RLS under, so this file decides what's
// public: only players whose family said yes to the directory, and only
// names, team, jersey, age (never the birthday), address and contact details.
// Nothing about fees, payments, shirts, waivers or requirements is selected,
// so none of it can reach the page.

import { createAdminClient } from "../supabase/admin";
import { ageFromDob } from "./age";
import { playerOwnEmail } from "./family-mail";

export interface PublicTeam {
  id: string;
  name: string;
  age_group: string | null;
  color: string | null;
}

export interface PublicParent {
  relationship: "father" | "mother" | "guardian";
  name: string;
  phone: string | null;
  email: string | null;
}

export interface PublicPlayer {
  id: string;
  full_name: string;
  // Worked out here from the birthday, which never leaves the server.
  age: number | null;
  age_group: string | null;
  team_id: string | null;
  jersey_number: string | null;
  team: PublicTeam | null;
  new_to_program: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  // The player's own email, left off when it's the same as a parent's.
  email: string | null;
  parents: PublicParent[];
}

export interface PublicDirectory {
  season: string | null;
  teams: PublicTeam[];
  players: PublicPlayer[];
}

interface Row {
  id: string;
  full_name: string;
  dob: string | null;
  age_group: string | null;
  team_id: string | null;
  jersey_number: string | null;
  new_to_program: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  team: PublicTeam | null;
  parents: {
    relationship: PublicParent["relationship"];
    member: { full_name: string | null; email: string | null; phone: string | null; deleted_at: string | null } | null;
  }[];
}

const COLUMNS =
  "id, full_name, dob, age_group, team_id, jersey_number, new_to_program, address_line1, address_line2, city, state, postal_code, phone, email, " +
  "team:olb_teams(id, name, age_group, color), " +
  "parents:olb_player_parents(relationship, member:members(full_name, email, phone, deleted_at))";

export async function loadPublicDirectory(): Promise<PublicDirectory> {
  const db = createAdminClient();
  const { data: board } = await db
    .from("olb_boards")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return { season: null, teams: [], players: [] };

  const [teams, players] = await Promise.all([
    db
      .from("olb_teams")
      .select("id, name, age_group, color")
      .eq("board_id", board.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("olb_players")
      .select(COLUMNS)
      .eq("board_id", board.id)
      .eq("directory_optin", true)
      .order("full_name", { ascending: true }),
  ]);

  const rows = (players.data as unknown as Row[] | null) ?? [];
  return {
    season: board.season as string,
    teams: (teams.data as PublicTeam[] | null) ?? [],
    players: rows.map(({ parents, dob, ...p }) => {
      const live = parents.filter((pa) => pa.member && !pa.member.deleted_at);
      return {
        ...p,
        age: ageFromDob(dob),
        email: playerOwnEmail({ email: p.email, parents: live }),
        parents: live.map((pa) => ({
          relationship: pa.relationship,
          name: pa.member!.full_name ?? pa.member!.email ?? "Unknown",
          phone: pa.member!.phone,
          email: pa.member!.email,
        })),
      };
    }),
  };
}
