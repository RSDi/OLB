// Per-request cached viewer lookup.
//
// React's `cache()` dedupes identical calls within a single server render —
// the layout, the sidebar, and every nested page can all call `getViewer()`
// and only the first one hits Supabase. Without this, every server page
// repeats the same auth check + `members` fetch, and the client sidebar then
// refetches the same row after hydration.
//
// `Viewer` exposes pre-computed `isStaff` / `isSuperAdmin` so callers don't
// need to import permission helpers separately.

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { createClient } from "../supabase/server";
import { loadGrants } from "./load-grants";
import {
  isStaff,
  isSuperAdmin,
  canEditSettings,
  canDeleteSettings,
  canUndeleteSettings,
  canManageFinances,
  canManageRegistrations,
  canManageTravel,
  canSlackDm,
  canManageWebsite,
  canSeeAllPlayers,
  canMemberNotes,
  canCheckRequirements,
  canApproveMembers,
  canEditContacts,
  canPlanHsSchedule,
  canManageTeams,
  canManageSiteLinks,
  canOpenSettings,
  type MemberLike,
  type MemberRole,
  type MemberStatus,
} from "./permissions";
import { seesFullUi } from "./feature-preview";

export interface Viewer {
  userId: string;
  memberId: string;
  role: MemberRole;
  status: MemberStatus;
  isStaff: boolean;
  isSuperAdmin: boolean;
  canEditSettings: boolean;
  canDeleteSettings: boolean;
  canUndeleteSettings: boolean;
  // Payments grant (0101): every family's balance, and recording payments.
  canManageFinances: boolean;
  // Registrations grant (0102): the registrations queue, team placement and
  // editing players.
  canManageRegistrations: boolean;
  // Travel grant (0110): keeps the hotels and places to eat in External
  // Contacts.
  canManageTravel: boolean;
  // Slack DMs grant (0118): messages families from the Directory as
  // themselves in Slack.
  canSlackDm: boolean;
  // Website grant (0120): edits the public site's menu, page text and
  // pictures in Settings → Website.
  canManageWebsite: boolean;
  // Board powers, for Board and whoever is given them (0123).
  canSeeAllPlayers: boolean;
  canMemberNotes: boolean;
  canCheckRequirements: boolean;
  canApproveMembers: boolean;
  canEditContacts: boolean;
  // Not counting coaches, who plan it too (viewerIsCoach).
  canPlanHsSchedule: boolean;
  // Super-admin powers, for super-admins and whoever is given them (0123).
  canManageTeams: boolean;
  canManageSiteLinks: boolean;
  // Board, or holds a permission whose page is in Settings.
  canOpenSettings: boolean;
  // Every permission key they hold (0122), for the help's per-permission
  // sections. Empty for super-admins, who hold everything anyway.
  permissions: string[];
  // Staged rollout: sees the nav items and Settings tabs still in preview.
  seesFullUi: boolean;
}

// The signed-in user, verified, once per request. Server pages use this
// instead of calling `supabase.auth.getUser()` themselves.
//
// Middleware has already made the full `getUser()` round trip to Supabase
// Auth for every /portal request (validating the session, refreshing its
// cookie, rejecting banned users), so rendering only needs the token's
// verified `sub`: `getClaims()`. With asymmetric JWT signing keys that check
// runs locally against Supabase's published public keys (cached across
// requests), so it costs no network call; with the legacy shared secret it
// falls back to `getUser()`, exactly as before. The ReelNotes API routes,
// which middleware doesn't cover, still make their own `getUser()` check.
//
// `sessionId` is the sign-in session (the token's `session_id` claim): the
// activity trail groups events by it, and "Preview as" pins a preview to it.
export const getAuthUser = cache(async (): Promise<{ id: string; email: string | null; sessionId: string | null } | null> => {
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    const email = data?.claims?.email;
    const sessionId = data?.claims?.session_id;
    return typeof id === "string" && id
      ? {
          id,
          email: typeof email === "string" ? email : null,
          sessionId: typeof sessionId === "string" && sessionId ? sessionId : null,
        }
      : null;
  } catch (err) {
    // getClaims() throws, rather than returning an error, for a few malformed
    // tokens (e.g. one already past its expiry). getUser() never threw, so
    // treat those as signed out, as before.
    unstable_rethrow(err);
    return null;
  }
});

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();

  // Core auth row never selects a grant, so a deploy ahead of a migration
  // can't log everyone out. The grants load alongside it, best-effort
  // (lib/auth/load-grants.ts): anything missing reads as no grant.
  const [{ data }, grants] = await Promise.all([
    supabase
      .from("members")
      .select("id, role, status")
      .eq("user_id", user.id)
      .maybeSingle(),
    loadGrants(supabase, user.id),
  ]);
  if (!data) return null;

  const row = data as { id: string; role: MemberRole; status: MemberStatus };
  const member: MemberLike = { ...grants, role: row.role, status: row.status };

  return {
    userId: user.id,
    memberId: row.id,
    role: row.role,
    status: row.status,
    isStaff: isStaff(member),
    isSuperAdmin: isSuperAdmin(member),
    canEditSettings: canEditSettings(member),
    canDeleteSettings: canDeleteSettings(member),
    canUndeleteSettings: canUndeleteSettings(member),
    canManageFinances: canManageFinances(member),
    canManageRegistrations: canManageRegistrations(member),
    canManageTravel: canManageTravel(member),
    canSlackDm: canSlackDm(member),
    canManageWebsite: canManageWebsite(member),
    canSeeAllPlayers: canSeeAllPlayers(member),
    canMemberNotes: canMemberNotes(member),
    canCheckRequirements: canCheckRequirements(member),
    canApproveMembers: canApproveMembers(member),
    canEditContacts: canEditContacts(member),
    canPlanHsSchedule: canPlanHsSchedule(member),
    canManageTeams: canManageTeams(member),
    canManageSiteLinks: canManageSiteLinks(member),
    canOpenSettings: canOpenSettings(member),
    permissions: member.permissions ?? [],
    seesFullUi: seesFullUi(user.email),
  };
});

// A coach: an approved member in a leadership volunteer role (Head coach,
// Assistant coach…) on a team (is_coach(), migration 0108). Coaches plan the
// HS Schedule and read the External Contacts types the board shares with
// them (0109). Asked at most once per request, and never for the board, who
// see all of that anyway, or for accounts not approved yet: for them it's
// false.
export const getIsCoach = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_coach");
  return !error && data === true;
});

export async function viewerIsCoach(viewer: Viewer | null): Promise<boolean> {
  if (!viewer || viewer.isStaff || viewer.status !== "approved") return false;
  return getIsCoach();
}

// Pending-approval count drives the badge on the Settings nav item. Only
// super-admins can action the queue, so the layout only requests this when
// the viewer qualifies.
export const getPendingMembersCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    // Only people who've signed in and asked. A pending row with no login is
    // a registered parent who hasn't signed up yet.
    .not("user_id", "is", null);
  return count ?? 0;
});
