// Can the signed-in member use the HS Schedule: the board, or a coach
// (lib/auth/viewer.ts getIsCoach, asked once per request)?

import { viewerIsCoach, type Viewer } from "../auth/viewer";
import { canUseHsSchedule } from "./access";

export async function viewerCanUseHsSchedule(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isStaff) return canUseHsSchedule(viewer, false);
  return canUseHsSchedule(viewer, await viewerIsCoach(viewer));
}
