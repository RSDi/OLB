// Is the signed-in member a coach (a leadership volunteer role on a team)?
// Asked once per request, and only for accounts that could otherwise see the
// HS Schedule, so it costs nothing while the page is in staged rollout.

import { cache } from "react";
import { createClient } from "../supabase/server";
import type { Viewer } from "../auth/viewer";
import { canUseHsSchedule } from "./access";

export const getIsCoach = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_coach");
  return !error && data === true;
});

export async function viewerCanUseHsSchedule(viewer: Viewer | null): Promise<boolean> {
  if (!viewer || !viewer.seesFullUi) return false;
  if (viewer.isStaff) return canUseHsSchedule(viewer, false);
  return canUseHsSchedule(viewer, await getIsCoach());
}
