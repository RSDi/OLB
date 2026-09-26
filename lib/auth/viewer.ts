// Per-request cached viewer lookup.
//
// React's `cache()` dedupes identical calls within a single server render —
// the layout, the sidebar, and every nested page can all call `getViewer()`
// and only the first one hits Supabase. Without this, every server page
// repeats the same `auth.getUser()` + `members` fetch, and the client
// sidebar then refetches the same row after hydration.
//
// `Viewer` exposes pre-computed `isStaff` / `isSuperAdmin` so callers don't
// need to import permission helpers separately.

import { cache } from "react";
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
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
    .eq("status", "pending");
  return count ?? 0;
});
