// The User Guide: every section of lib/help/guide.ts this viewer can use,
// with search and a table of contents. Rendered on the server so a deep link
// from the top-bar "i" panel (/portal/guide#help-<id>) lands on a section
// that's already on the page.
import { getViewer, viewerIsCoach } from "../../../lib/auth/viewer";
import { GUIDE_UPDATED, guideSectionsFor } from "../../../lib/help/guide";
import { WELCOME_TOUR_ID, tourForSection } from "../../../lib/help/tours";
import { GuideView } from "./GuideView";

export default async function UserGuidePage() {
  const found = await getViewer();
  // Coaches also read the "coaches" sections (the HS Schedule, External Contacts).
  const viewer = found ? { ...found, isCoach: await viewerIsCoach(found) } : null;
  const sections = guideSectionsFor(viewer);
  // Section id → the guided tour that walks through it (lib/help/tours.ts).
  const tours: Record<string, string> = {};
  for (const s of sections) {
    const tour = tourForSection(s.id, viewer);
    if (tour && tour.id !== WELCOME_TOUR_ID) tours[s.id] = tour.id;
  }
  return <GuideView sections={sections} tours={tours} updated={GUIDE_UPDATED} />;
}
