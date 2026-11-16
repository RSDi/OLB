// Help Center: short how-tos (lib/help/help-center.ts) this viewer can use,
// with search, grouped by topic. Each opens to its steps, Show me how (a
// guided tour on the real page) and Read more in the User Guide.
import { getViewer, viewerIsCoach } from "../../../lib/auth/viewer";
import { howToTour, howTosFor } from "../../../lib/help/help-center";
import { HelpCenterView, type HowToItem } from "./HelpCenterView";

export default async function HelpCenterPage() {
  const found = await getViewer();
  // Coaches also read the coaches' how-tos, like the User Guide.
  const viewer = found ? { ...found, isCoach: await viewerIsCoach(found) } : null;
  const items: HowToItem[] = howTosFor(viewer).map(h => ({
    id: h.id,
    question: h.question,
    topic: h.topic,
    sectionId: h.sectionId,
    steps: h.steps,
    keywords: h.keywords ?? [],
    tour: howToTour(h, viewer),
  }));
  return <HelpCenterView items={items} />;
}
