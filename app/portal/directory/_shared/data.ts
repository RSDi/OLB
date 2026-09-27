// Shared data fetching + types for all /portal/directory/* views. The leading
// underscore on the folder name excludes it from Next.js routing.

import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { getViewer } from "../../../../lib/auth/viewer";

export type DirectoryCategory = "regular" | "extended" | "memorial";

export interface DirectoryMember {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  home_phone: string | null;
  birthday: string | null;
  anniversary: string | null;
  address: string | null;
  directory_category: DirectoryCategory;
  deceased_at: string | null;
}

export interface DirectoryRelationship {
  member_id: string;
  related_member_id: string;
  relationship: "spouse" | "parent" | "child";
}

export interface DirectoryViewer {
  memberId: string;
  userId: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
}

// Auth + access guard reused across every directory view. Redirects to
// /login if no session. Returns null if the viewer isn't approved/staff
// (caller renders an inline notice). Delegates the actual fetch to
// `getViewer()` so the layout's cached lookup is reused — no duplicate
// Supabase query per request.
//
// Views start their member queries *before* awaiting this, so the two run in
// parallel instead of back to back (one fewer round trip per page view). That
// is safe because every query here runs under the viewer's own RLS: someone
// who isn't approved gets nothing back, and the view renders AccessDenied
// without using it.
export async function loadViewer(): Promise<DirectoryViewer | null> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.status !== "approved" && !viewer.isStaff) return null;
  return {
    memberId: viewer.memberId,
    userId: viewer.userId,
    isStaff: viewer.isStaff,
    isSuperAdmin: viewer.isSuperAdmin,
  };
}

const MEMBER_COLUMNS =
  "id, user_id, email, full_name, nickname, avatar_url, phone, home_phone, birthday, anniversary, address, directory_category, deceased_at";

export async function loadMembers(opts: {
  categories?: DirectoryCategory[];
  includeMemorials?: boolean;
}): Promise<DirectoryMember[]> {
  const supabase = await createClient();
  let q = supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("status", "approved")
    .is("deleted_at", null);
  if (opts.categories) q = q.in("directory_category", opts.categories);
  else if (!opts.includeMemorials) q = q.neq("directory_category", "memorial");
  const { data } = await q.order("full_name", { ascending: true });
  return (data as DirectoryMember[] | null) ?? [];
}

// A player on the season board (the Team manager's olb_players) with the
// parents linked to them (members rows).
export interface DirectoryParent {
  relationship: "father" | "mother" | "guardian";
  member: {
    id: string;
    user_id: string | null;
    status: "pending" | "approved" | "denied";
    full_name: string | null;
    email: string | null;
    phone: string | null;
    volunteer_interests: string | null;
  } | null;
}

export interface DirectoryPlayer {
  id: string;
  full_name: string;
  dob: string | null;
  age_group: string | null;
  team_id: string | null;
  jersey_number: string | null;
  team: { id: string; name: string; age_group: string | null; color: string | null } | null;
  board: { season: string } | null;
  new_to_program: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  registration_fee: string | null;
  payment_method: string | null;
  shirt_size: string | null;
  waiver_signed: boolean;
  waiver_signed_on: string | null;
  directory_optin: boolean;
  parents: DirectoryParent[];
}

const PLAYER_COLUMNS =
  "id, team_id, jersey_number, full_name, dob, age_group, new_to_program, address_line1, address_line2, city, state, postal_code, phone, email, registration_fee, payment_method, shirt_size, waiver_signed, waiver_signed_on, directory_optin, " +
  "team:olb_teams(id, name, age_group, color), board:olb_boards(season), " +
  "parents:olb_player_parents(relationship, member:members(id, user_id, status, full_name, email, phone, volunteer_interests))";

// Every player on the latest season's board ("2026-2027" style, so seasons
// sort as text). RLS decides who's listed: staff see everyone, approved
// members see the players whose family opted into the directory. Parents show
// whether or not they've been approved for the portal yet (0091); a deleted
// one comes back with member: null and is dropped.
export async function loadPlayers(): Promise<DirectoryPlayer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("olb_players")
    .select(PLAYER_COLUMNS)
    .order("full_name", { ascending: true });
  const players = (data as unknown as DirectoryPlayer[] | null) ?? [];
  const season = players.reduce((max, p) => ((p.board?.season ?? "") > max ? p.board!.season : max), "");
  return players
    .filter((p) => p.board?.season === season)
    .map((p) => ({ ...p, parents: p.parents.filter((pa) => pa.member) }));
}
