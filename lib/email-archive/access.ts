import { redirect } from "next/navigation";
import { getViewer, type Viewer } from "../auth/viewer.ts";
import { ARCHIVES_SLACK } from "../slack-archive/paths.ts";

export function canViewEmailArchive(viewer: Viewer | null): viewer is Viewer {
  return Boolean(viewer && viewer.isStaff);
}

export async function loadEmailArchiveViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!canViewEmailArchive(viewer)) redirect(ARCHIVES_SLACK);
  return viewer;
}
