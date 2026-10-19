"use client";

import { useRouter } from "next/navigation";
import { BatchBilling } from "invoicing/ui";
import type { BatchInput, EventCustomer, InvoiceClubSettings } from "invoicing";
import { createBatchInvoicesAction } from "../../../../../../lib/invoicing/actions";

export function BillPage({
  weekendId,
  eventLabel,
  feeCents,
  customers,
  dueOn,
  depositDueOn,
  canInvoice,
  clubSettings,
  fromEmail,
}: {
  weekendId: string;
  eventLabel: string;
  feeCents: number;
  customers: EventCustomer[];
  dueOn: string;
  depositDueOn: string;
  canInvoice: boolean;
  clubSettings: InvoiceClubSettings;
  fromEmail: string;
}) {
  const router = useRouter();
  return (
    <BatchBilling
      eventId={weekendId}
      eventLabel={eventLabel}
      feeCents={feeCents}
      customers={customers}
      dueOn={dueOn}
      depositOn={false}
      depositPerTeamCents={0}
      depositDueOn={depositDueOn}
      canInvoice={canInvoice}
      reminders={clubSettings}
      clubCc={clubSettings.ccEmails}
      clubBcc={clubSettings.bccEmails}
      fromEmail={fromEmail}
      backHref={`/portal/schedule/hosted/${weekendId}`}
      onSubmit={async (input: BatchInput, send: boolean) => {
        const res = await createBatchInvoicesAction({ ...input, eventId: weekendId }, send);
        if (res.error) return res;
        router.push(`/portal/payments/invoices/event/${weekendId}`);
        return res;
      }}
    />
  );
}
