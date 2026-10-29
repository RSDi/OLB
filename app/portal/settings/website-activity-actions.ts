"use server";
// The read for Settings → Website Activity. Super-admins on the staged-rollout
// list only, like the portal's Activity; RLS keeps website_events to the same
// accounts (can_see_activity(), 0100).

import { requireSuperAdmin } from "../../../lib/auth/guards";
import { getAuthUser } from "../../../lib/auth/viewer";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import { loadWebsiteActivity, type WebsiteActivity } from "../../../lib/activity/website-queries";

export async function fetchWebsiteActivity(): Promise<{ error: string } | { data: WebsiteActivity }> {
  const g = await requireSuperAdmin();
  if ("error" in g) return { error: g.error };
  const me = await getAuthUser();
  if (!me || !seesFullUi(me.email)) return { error: "Website activity isn't available on your account yet." };
  return { data: await loadWebsiteActivity() };
}
