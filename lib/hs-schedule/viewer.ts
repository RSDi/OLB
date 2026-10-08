// Can the signed-in member use the HS Schedule: the board, or a coach
// (lib/auth/viewer.ts getIsCoach, asked once per request)? And the travel
// coordinator, who only looks (hsScheduleAccess).

import { viewerIsCoach, type Viewer } from "../auth/viewer";
import { canUseHsSchedule, hsScheduleAccess } from "./access";

export async function viewerCanUseHsSchedule(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isStaff || viewer.canPlanHsSchedule) return canUseHsSchedule(viewer, false);
  return canUseHsSchedule(viewer, await viewerIsCoach(viewer));
}

export async function viewerHsScheduleAccess(viewer: Viewer | null): Promise<"edit" | "view" | null> {
  if (!viewer) return null;
  if (viewer.isStaff || viewer.canPlanHsSchedule) return hsScheduleAccess(viewer, false);
  return hsScheduleAccess(viewer, await viewerIsCoach(viewer));
}
