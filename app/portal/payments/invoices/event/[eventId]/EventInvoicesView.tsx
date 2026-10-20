"use client";

import { EventInvoices } from "invoicing/ui";
import type { EventCollection, Invoice } from "invoicing";
import { olbInvoicePaths } from "../../../../../../lib/invoicing/paths";

/** Client wrapper so path helpers stay on this side of the RSC boundary. */
export function EventInvoicesView({
  eventLabel,
  invoices,
  summary,
  today,
  feeCents,
  depositDueOn,
  balanceDueOn,
  checklistHref,
}: {
  eventLabel: string;
  invoices: Invoice[];
  summary: EventCollection;
  today: string;
  feeCents?: number;
  depositDueOn?: string | null;
  balanceDueOn?: string | null;
  checklistHref?: string;
}) {
  return (
    <EventInvoices
      eventLabel={eventLabel}
      invoices={invoices}
      summary={summary}
      today={today}
      feeCents={feeCents}
      depositDueOn={depositDueOn}
      balanceDueOn={balanceDueOn}
      checklistHref={checklistHref}
      paths={olbInvoicePaths}
    />
  );
}
