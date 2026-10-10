import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { loadRoadmap } from "../../../lib/roadmap/data";
import { RoadmapView } from "./RoadmapView";

// What's live, being built, planned, and ideas (migration 0129). Super-admins
// on the preview list only, for now.
export default async function RoadmapPage() {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin || !viewer.seesFullUi) redirect("/portal/directory");
  const { items, linkKey, error } = await loadRoadmap();
  return <RoadmapView items={items} mode="edit" linkKey={linkKey} error={error} />;
}
