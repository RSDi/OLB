"use server";
// Activity reads for Settings → Members (its Activity tab, and the activity
// on each Approved row). Super-admins on the staged-rollout list only, like
// the session pages; RLS keeps the tables super-admin-only as well.

import { requireSuperAdmin } from "../../../lib/auth/guards";
import { getAuthUser } from "../../../lib/auth/viewer";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import {
  loadActivityOverview,
  loadUserSessions,
  type ActivityOverview,
  type SessionSummary,
} from "../../../lib/activity/queries";

async function gate(): Promise<string | null> {
  const g = await requireSuperAdmin();
  if ("error" in g) return g.error;
  const me = await getAuthUser();
  if (!me || !seesFullUi(me.email)) return "Activity isn't available on your account yet.";
  return null;
}

export async function fetchActivityOverview(): Promise<{ error: string } | { data: ActivityOverview }> {
  const blocked = await gate();
  if (blocked) return { error: blocked };
  return { data: await loadActivityOverview() };
}

export async function fetchMemberSessions(
  userId: string
): Promise<{ error: string } | { sessions: SessionSummary[]; asOf: number }> {
  const blocked = await gate();
  if (blocked) return { error: blocked };
  const { sessions, asOf, error } = await loadUserSessions(userId);
  if (error) return { error: `Couldn't load their sessions: ${error}` };
  return { sessions, asOf };
}
