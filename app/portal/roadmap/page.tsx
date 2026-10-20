import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { loadRoadmap } from "../../../lib/roadmap/data";
import { RoadmapView } from "./RoadmapView";

// Always the board as it stands. A bot PATCH used to leave this page stale
// because it was cacheable and the write path didn't expire every copy.
export const dynamic = "force-dynamic";

// What's live, being built, planned, ideas, and parked (migrations 0129,
// 0136, 0139, 0154). Super-admins on the preview list only, for now.
export default async function RoadmapPage() {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin || !viewer.seesFullUi) redirect("/portal/directory");
  const { items, linkKey, error } = await loadRoadmap();
  return <RoadmapView items={items} mode="edit" linkKey={linkKey} error={error} />;
}
