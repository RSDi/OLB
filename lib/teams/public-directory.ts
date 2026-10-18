// The public Directory (/directory/<key>): this season's players and their
// parents, for anyone with the link, no login. Reads with the service role
// because there's no session to run RLS under, so this file decides what's
// public: only players whose family said yes to the directory, and only
// names, team, jersey, age (never the birthday), city and ZIP (never the
// street), and contact details.
// Nothing about fees, payments, shirts, waivers or requirements is selected,
// so none of it can reach the page. Each team's coaches and volunteers come
// along too, from the same jobs the board assigns on the team's Directory
// page (Settings → Volunteer Roles, olb_team_volunteers). Coaching roles are
// the open list. Every other role is a volunteer seat, including an empty
// one, so the page can say "Open Spot". The registration form is not a
// reader of this: it only records who is willing to help.

import { createAdminClient } from "../supabase/admin";
import { ageFromDob } from "./age";
import { playerOwnEmail } from "./family-mail";
import { isDirectoryCoach, type PublicAssignment, type PublicRole } from "./public-directory-staff";

export type { PublicAssignment, PublicRole };

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
  // City, state and ZIP only: the street address never leaves the server.
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
  // Every current volunteer role, in Settings order. `coach` is the open list.
  roles: PublicRole[];
  // People already in a seat. Empty seats are not rows; the page adds them.
  assignments: PublicAssignment[];
}

interface Row {
  id: string;
  full_name: string;
  dob: string | null;
  age_group: string | null;
  team_id: string | null;
  jersey_number: string | null;
  new_to_program: boolean;
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

interface RoleRow {
  id: string;
  name: string;
  spots_per_team: number;
  is_leadership: boolean;
  sort_order: number;
}

interface AssignmentRow {
  id: string;
  team_id: string;
  role_id: string;
  member: { full_name: string | null; email: string | null; phone: string | null; deleted_at: string | null } | null;
}

const COLUMNS =
  "id, full_name, dob, age_group, team_id, jersey_number, new_to_program, city, state, postal_code, phone, email, " +
  "team:olb_teams(id, name, age_group, color), " +
  "parents:olb_player_parents(relationship, member:members(full_name, email, phone, deleted_at))";

// The key in the page's link (Settings → Public Directory, 0119), or null
// when the page is off or the table isn't there yet.
export async function loadPublicDirectoryKey(): Promise<string | null> {
  const { data } = await createAdminClient().from("public_directory_link").select("key").maybeSingle();
  return (data as { key: string | null } | null)?.key ?? null;
}

export async function loadPublicDirectory(): Promise<PublicDirectory> {
  const db = createAdminClient();
  const { data: board } = await db
    .from("olb_boards")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return { season: null, teams: [], players: [], roles: [], assignments: [] };

  const [teams, players, roles] = await Promise.all([
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
    db
      .from("olb_volunteer_roles")
      .select("id, name, spots_per_team, is_leadership, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const teamList = (teams.data as PublicTeam[] | null) ?? [];
  const roleList: PublicRole[] = ((roles.data as RoleRow[] | null) ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    spots: r.spots_per_team,
    coach: isDirectoryCoach(r),
  }));
  const { data: spots } =
    teamList.length && roleList.length
      ? await db
          .from("olb_team_volunteers")
          .select("id, team_id, role_id, member:members(full_name, email, phone, deleted_at)")
          .in(
            "team_id",
            teamList.map((t) => t.id)
          )
          .in(
            "role_id",
            roleList.map((r) => r.id)
          )
      : { data: [] };
  const name = (v: AssignmentRow) => v.member!.full_name ?? v.member!.email ?? "Unknown";
  const assignments = ((spots as unknown as AssignmentRow[] | null) ?? [])
    .filter((v) => v.member && !v.member.deleted_at)
    .map((v) => ({
      id: v.id,
      team_id: v.team_id,
      role_id: v.role_id,
      name: name(v),
      phone: v.member!.phone,
      email: v.member!.email,
    }));

  const rows = (players.data as unknown as Row[] | null) ?? [];
  return {
    season: board.season as string,
    teams: teamList,
    roles: roleList,
    assignments,
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
