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
}

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return null;

  const row = data as { id: string; role: MemberRole; status: MemberStatus };
  return {
    userId: user.id,
    memberId: row.id,
    role: row.role,
    status: row.status,
    isStaff: isStaff(row),
    isSuperAdmin: isSuperAdmin(row),
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
