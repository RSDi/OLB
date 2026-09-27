// The User Guide: every section of lib/help/guide.ts this viewer can use,
// with search and a table of contents. Rendered on the server so a deep link
// from the top-bar "i" panel (/portal/guide#help-<id>) lands on a section
// that's already on the page.
import { getViewer } from "../../../lib/auth/viewer";
import { GUIDE_UPDATED, guideSectionsFor } from "../../../lib/help/guide";
import { GuideView } from "./GuideView";

export default async function UserGuidePage() {
  const viewer = await getViewer();
  return <GuideView sections={guideSectionsFor(viewer)} updated={GUIDE_UPDATED} />;
}
