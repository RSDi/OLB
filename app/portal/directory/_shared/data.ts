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

// A registered player with the parents linked to them (members rows).
export interface DirectoryParent {
  relationship: "father" | "mother" | "guardian";
  member: {
    id: string;
    user_id: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    volunteer_interests: string | null;
  } | null;
}

export interface DirectoryPlayer {
  id: string;
  season: string;
  team: string | null;
  first_name: string;
  last_name: string;
  birthdate: string | null;
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
  parents: DirectoryParent[];
}

const PLAYER_COLUMNS =
  "id, season, team, first_name, last_name, birthdate, new_to_program, address_line1, address_line2, city, state, postal_code, phone, email, registration_fee, payment_method, shirt_size, waiver_signed, waiver_signed_on, " +
  "parents:player_parents(relationship, member:members(id, user_id, full_name, email, phone, volunteer_interests))";

// Every player in the latest season on file (seasons are "2026-27" style, so
// they sort as text). A parent the viewer can't see (not approved, or
// deleted) comes back with member: null and is dropped.
export async function loadPlayers(): Promise<DirectoryPlayer[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("players")
    .select(PLAYER_COLUMNS)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  const players = (data as unknown as DirectoryPlayer[] | null) ?? [];
  const season = players.reduce((max, p) => (p.season > max ? p.season : max), "");
  return players
    .filter((p) => p.season === season)
    .map((p) => ({ ...p, parents: p.parents.filter((pa) => pa.member) }));
}
