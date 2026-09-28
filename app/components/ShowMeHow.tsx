"use client";
// "Show me how" at the top of a page or Settings tab: starts its guided
// walkthrough (lib/help/tours.ts).
import { Pill } from "./ui";
import { useTour } from "./GuidedTour";

export function ShowMeHow({ tour }: { tour: string }) {
  const { start } = useTour();
  return (
    <Pill variant="ghost" size="sm" onClick={() => start(tour)}>
      Show me how
    </Pill>
  );
}
