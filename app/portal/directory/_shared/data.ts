// Shared data fetching + types for all /portal/directory/* views. The leading
// underscore on the folder name excludes it from Next.js routing.

import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getViewer } from "../../../../lib/auth/viewer";
import { loadNames } from "../../../../lib/teams/registration-data";
import type { SentMessage } from "../../../../lib/teams/family-mail";
import {
  PLAYER_REQUIREMENT_COLUMNS,
  REQUIREMENT_COLUMNS,
  type PlayerRequirement,
  type Requirement,
} from "../../../../lib/requirements/types";

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
  // The Registrations grant (0102): the registrations queue, putting players
  // on teams and editing them.
  canManageRegistrations: boolean;
  // The Slack DMs grant (0118): Slack families from the Directory.
  canSlackDm: boolean;
  // Board powers, also given by permission (0123): every player with their
  // fees, waivers and parents' details; the Member notes; checking players
  // off on requirements.
  canSeeAllPlayers: boolean;
  canMemberNotes: boolean;
  canCheckRequirements: boolean;
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
    canManageRegistrations: viewer.canManageRegistrations,
    canSlackDm: viewer.canSlackDm,
    canSeeAllPlayers: viewer.canSeeAllPlayers,
    canMemberNotes: viewer.canMemberNotes,
    canCheckRequirements: viewer.canCheckRequirements,
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

// A player on the season board (olb_players) with the
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
// sort as text). RLS decides who's listed: staff and the Registrations and
// Payments grants see everyone, approved members see the players whose family
// opted into the directory, and parents see their own. Parents show
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

// Player requirements (0098) for the board: the active list, plus every
// player's record against it with the name of whoever marked it. RLS returns
// nothing to anyone else, and the page only asks for staff. Rows for other
// seasons' players are dropped by the caller.
export interface DirectoryRequirements {
  requirements: Requirement[];
  rows: PlayerRequirement[];
}

export async function loadRequirements(): Promise<DirectoryRequirements> {
  const supabase = await createClient();
  const { data: reqs } = await supabase
    .from("olb_requirements")
    .select(REQUIREMENT_COLUMNS)
    .eq("active", true)
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  const requirements = (reqs as Requirement[] | null) ?? [];
  if (requirements.length === 0) return { requirements, rows: [] };

  const { data } = await supabase
    .from("olb_player_requirements")
    .select(PLAYER_REQUIREMENT_COLUMNS)
    .in("requirement_id", requirements.map((r) => r.id));
  const rows = (data as PlayerRequirement[] | null) ?? [];

  const markers = [...new Set(rows.map((r) => r.marked_by).filter((id): id is string => !!id))];
  if (markers.length > 0) {
    const { data: people } = await supabase.from("members").select("user_id, full_name").in("user_id", markers);
    const names = new Map(
      ((people as { user_id: string; full_name: string | null }[] | null) ?? []).map((m) => [m.user_id, m.full_name])
    );
    for (const r of rows) r.marked_by_name = r.marked_by ? names.get(r.marked_by) ?? null : null;
  }
  return { requirements, rows };
}

// Emails (0116) and Slack DMs (0118) sent to a player's family from the
// Directory, newest first, for the board, the Registrations grant and the
// Slack DMs grant (RLS returns nothing to anyone else, or before 0116 is
// applied). Before 0118 there's no `via`, so everything reads as email.
export async function loadPlayerMessages(playerId: string): Promise<SentMessage[]> {
  const supabase = await createClient();
  const read = (cols: string) =>
    supabase.from("olb_player_messages").select(cols).eq("player_id", playerId).order("sent_at", { ascending: false });
  const withVia = await read("id, subject, body, sent_to, sent_at, sent_by, via");
  const { data } = withVia.error ? await read("id, subject, body, sent_to, sent_at, sent_by") : withVia;
  const rows = (data as (Omit<SentMessage, "sent_by_name"> & { sent_by: string | null })[] | null) ?? [];
  const fromRegistration = await loadRegistrationMessages(playerId);
  if (rows.length === 0 && fromRegistration.length === 0) return [];
  const names = await loadNames([...rows, ...fromRegistration].map((r) => r.sent_by));
  return [...rows, ...fromRegistration]
    .map(({ sent_by, ...m }) => ({
      ...m,
      // No sender: the registration form's receipt, sent by the website.
      sent_by_name: sent_by ? names.get(sent_by) ?? null : "the registration form",
    }))
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

// Emails kept on the registration(s) this player was approved from: the
// receipt sent when the family registered, and waitlist messages. The page
// only asks for the board and the Registrations grant (canEmail), so this
// reads with the service role, narrowed to this player's registrations.
async function loadRegistrationMessages(playerId: string) {
  const db = createAdminClient();
  const { data: regs } = await db.from("olb_registrations").select("id").eq("player_id", playerId);
  const ids = ((regs as { id: string }[] | null) ?? []).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data } = await db
    .from("olb_registration_messages")
    .select("id, subject, body, sent_to, sent_at, sent_by")
    .in("registration_id", ids);
  return ((data as (Omit<SentMessage, "sent_by_name"> & { sent_by: string | null })[] | null) ?? []).map((m) => ({ ...m, via: "email" as const }));
}
