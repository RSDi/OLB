import type { EventCollection } from "invoicing";

export function autoStepDone(stepKey: string, summary: EventCollection): boolean | null {
  if (stepKey === "bill_programs") return summary.invoiceCount > 0;
  if (stepKey === "invoices_sent") return summary.allSent;
  if (stepKey === "team_fees_collected") return summary.allCollected;
  return null;
}

/** Team fees collected copy: drafts-only is still "Not billed yet". */
export function teamFeesAreBilled(sentCount: number): boolean {
  return sentCount > 0;
}
