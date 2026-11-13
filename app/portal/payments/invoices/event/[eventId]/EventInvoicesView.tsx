"use client";

import { useRouter } from "next/navigation";
import { EventInvoices } from "invoicing/ui";
import { voidEventInvoicesAction } from "../../../../../../lib/invoicing/actions";
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
  rateLabel,
  eventId,
  canInvoice = false,
}: {
  eventLabel: string;
  invoices: Invoice[];
  summary: EventCollection;
  today: string;
  feeCents?: number;
  depositDueOn?: string | null;
  balanceDueOn?: string | null;
  checklistHref?: string;
  rateLabel?: string;
  eventId: string;
  canInvoice?: boolean;
}) {
  const router = useRouter();
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
      rateLabel={rateLabel}
      canInvoice={canInvoice}
      onVoidAll={async () => {
        const res = await voidEventInvoicesAction(eventId);
        router.refresh();
        return res;
      }}
      paths={olbInvoicePaths}
    />
  );
}
