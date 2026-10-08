// Server-side loaders for teams, their volunteer roles and who fills them.
// Everything runs under the caller's RLS: approved members can read teams,
// roles and assignments (0092); only super-admins write.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer } from "../auth/viewer";
import type { OlbTeam, OlbTeamVolunteer, OlbVolunteerRole } from "./types";

export type TeamWithStaff = OlbTeam & { volunteers: OlbTeamVolunteer[] };

const ROLE_COLUMNS =
  "id, name, description, spots_per_team, is_leadership, show_in_directory, registration_interest, sort_order";
const VOLUNTEER_COLUMNS = "id, team_id, role_id, member:members(id, full_name, email, phone)";

// The latest season's board ("2026-2027" style, so seasons sort as text).
export async function loadCurrentBoard(): Promise<{ id: string; season: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("olb_boards")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; season: string } | null) ?? null;
}

export async function loadVolunteerRoles(): Promise<OlbVolunteerRole[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("olb_volunteer_roles")
    .select(ROLE_COLUMNS)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data as OlbVolunteerRole[] | null) ?? [];
}

// A member hidden by RLS (or deleted) comes back as member: null; drop those.
function cleanVolunteers(rows: unknown): OlbTeamVolunteer[] {
  return ((rows as OlbTeamVolunteer[] | null) ?? []).filter((v) => v.member);
}

// The current board's teams, for a team picker.
export async function loadSeasonTeams(): Promise<Pick<OlbTeam, "id" | "name" | "age_group" | "color">[]> {
  const board = await loadCurrentBoard();
  if (!board) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("olb_teams")
    .select("id, name, age_group, color")
    .eq("board_id", board.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data as Pick<OlbTeam, "id" | "name" | "age_group" | "color">[] | null) ?? [];
}

// Every team on the current board with its volunteers, plus the roles.
export async function loadTeamsWithStaff(): Promise<{
  season: string | null;
  teams: TeamWithStaff[];
  roles: OlbVolunteerRole[];
}> {
  const board = await loadCurrentBoard();
  if (!board) return { season: null, teams: [], roles: [] };
  const supabase = await createClient();
  const [{ data: teams }, roles] = await Promise.all([
    supabase
      .from("olb_teams")
      .select("*")
      .eq("board_id", board.id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    loadVolunteerRoles(),
  ]);
  const list = (teams as OlbTeam[] | null) ?? [];
  const ids = list.map((t) => t.id);
  const { data: vols } = ids.length
    ? await supabase.from("olb_team_volunteers").select(VOLUNTEER_COLUMNS).in("team_id", ids)
    : { data: [] };
  const volunteers = cleanVolunteers(vols);
  return {
    season: board.season,
    roles,
    teams: list.map((t) => ({ ...t, volunteers: volunteers.filter((v) => v.team_id === t.id) })),
  };
}

export async function loadTeamWithStaff(
  teamId: string
): Promise<{ team: TeamWithStaff; roles: OlbVolunteerRole[] } | null> {
  const supabase = await createClient();
  const [{ data: team }, { data: vols }, roles] = await Promise.all([
    supabase.from("olb_teams").select("*").eq("id", teamId).maybeSingle(),
    supabase.from("olb_team_volunteers").select(VOLUNTEER_COLUMNS).eq("team_id", teamId),
    loadVolunteerRoles(),
  ]);
  if (!team) return null;
  return { team: { ...(team as OlbTeam), volunteers: cleanVolunteers(vols) }, roles };
}

// Holders of a leadership role get the Directory's age-group view.
export function holdsLeadershipRole(
  memberId: string,
  teams: TeamWithStaff[],
  roles: OlbVolunteerRole[]
): boolean {
  const lead = new Set(roles.filter((r) => r.is_leadership).map((r) => r.id));
  return teams.some((t) => t.volunteers.some((v) => v.member.id === memberId && lead.has(v.role_id)));
}

export interface AssignablePerson {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  volunteer_interests: string | null;
}

// Anyone who can fill a role: every member who isn't denied or deleted,
// whether or not they have a login. For whoever fills team spots: a
// super-admin, or anyone with the Teams & volunteers permission (0123). RLS
// lets only the board read every member, so for someone off the board the
// list comes through the service key, after the check here.
export async function loadAssignablePeople(): Promise<AssignablePerson[]> {
  const viewer = await getViewer();
  if (!viewer?.canManageTeams) return [];
  const supabase = viewer.isStaff ? await createClient() : createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("id, full_name, email, phone, volunteer_interests")
    .is("deleted_at", null)
    .neq("status", "denied")
    .order("full_name", { ascending: true });
  return (data as AssignablePerson[] | null) ?? [];
}
