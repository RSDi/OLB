"use client";

import { useRouter } from "next/navigation";
import { BatchBilling } from "invoicing/ui";
import type { BatchCustomerInput, BatchInput, ReminderSettings } from "invoicing";
import { createBatchInvoicesAction } from "../../../../../../lib/invoicing/actions";

export function BillPage({
  weekendId,
  eventLabel,
  feeCents,
  customers,
  dueOn,
  depositDueOn,
  canInvoice,
  reminders,
  fromEmail,
}: {
  weekendId: string;
  eventLabel: string;
  feeCents: number;
  customers: BatchCustomerInput[];
  dueOn: string;
  depositDueOn: string;
  canInvoice: boolean;
  reminders: ReminderSettings;
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
      depositOn={true}
      depositPerTeamCents={Math.round(feeCents > 0 ? 10000 : 0)}
      depositDueOn={depositDueOn}
      canInvoice={canInvoice}
      reminders={reminders}
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
