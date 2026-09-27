"use client";
// "Show me how" at the top of a Settings tab: starts that tab's guided
// walkthrough (lib/help/tours.ts).
import { Pill } from "../../components/ui";
import { useTour } from "../../components/GuidedTour";

export function ShowMeHow({ tour }: { tour: string }) {
  const { start } = useTour();
  return (
    <Pill variant="ghost" size="sm" onClick={() => start(tour)}>
      Show me how
    </Pill>
  );
}
