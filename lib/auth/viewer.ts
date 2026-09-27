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
import {
  isStaff,
  isSuperAdmin,
  canEditSettings,
  canDeleteSettings,
  canUndeleteSettings,
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
export const getAuthUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getClaims();
    const id = data?.claims?.sub;
    const email = data?.claims?.email;
    return typeof id === "string" && id
      ? { id, email: typeof email === "string" ? email : null }
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

  // Core auth row never selects the grant columns, so a pre-0057 deploy can't
  // log everyone out. Settings grants (migration 0057) load in a separate
  // best-effort query, in parallel on the same user_id so they cost no extra
  // round trip. If the columns aren't there yet that query errors → grants
  // default false (view-only), which is the safe default.
  const [{ data }, { data: g }] = await Promise.all([
    supabase
      .from("members")
      .select("id, role, status")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("members")
      .select("can_edit_settings, can_delete_settings, can_undelete_settings")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (!data) return null;

  const row = data as { id: string; role: MemberRole; status: MemberStatus };
  const grants = (g as Partial<MemberLike> | null) ?? {};
  const member: MemberLike = {
    role: row.role,
    status: row.status,
    can_edit_settings: !!grants.can_edit_settings,
    can_delete_settings: !!grants.can_delete_settings,
    can_undelete_settings: !!grants.can_undelete_settings,
  };

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
    seesFullUi: seesFullUi(user.email),
  };
});

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
