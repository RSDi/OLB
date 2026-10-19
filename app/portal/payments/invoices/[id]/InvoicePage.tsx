"use client";

import { useRouter } from "next/navigation";
import { InvoiceDetail } from "invoicing/ui";
import type { Invoice, OrgSettings, ReminderSettings, RecordPaymentInput, UpdateInvoiceInput } from "invoicing";
import { olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { recordInvoicePaymentAction, saveInvoiceRemindersAction, sendInvoiceAction, updateInvoiceAction } from "../../../../../lib/invoicing/actions";

export function InvoicePage({
  invoice,
  today,
  canInvoice,
  org,
  reminders,
  fromEmail,
  backHref,
  backLabel,
}: {
  invoice: Invoice;
  today: string;
  canInvoice: boolean;
  org: OrgSettings;
  reminders: ReminderSettings;
  fromEmail: string;
  backHref: string;
  backLabel?: string;
}) {
  const router = useRouter();
  return (
    <InvoiceDetail
      invoice={invoice}
      today={today}
      canInvoice={canInvoice}
      org={org}
      reminders={reminders}
      fromEmail={fromEmail}
      backHref={backHref}
      backLabel={backLabel}
      onSend={async () => {
        const res = await sendInvoiceAction(invoice.id);
        if (!res.error) router.refresh();
        return res;
      }}
      onSaveDraft={async (patch) => {
        const input: UpdateInvoiceInput = {
          dueOn: patch.dueOn,
          depositCents: patch.depositCents,
          depositDueOn: patch.depositDueOn,
          lines: patch.lines,
        };
        const res = await updateInvoiceAction(invoice.id, input);
        return res;
      }}
      onRecordPayment={async (input: RecordPaymentInput) => {
        const res = await recordInvoicePaymentAction(invoice.id, input);
        if (!res.error) router.refresh();
        return res;
      }}
      onRemindersChange={async (next) => {
        await saveInvoiceRemindersAction(next);
        router.refresh();
      }}
    />
  );
}
