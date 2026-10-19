"use client";

import { useRouter } from "next/navigation";
import { InvoiceDetail } from "invoicing/ui";
import type { Invoice, InvoiceClubSettings, OrgSettings, RecordPaymentInput, ReminderSettings, UpdateInvoiceInput } from "invoicing";
import {
  recordInvoicePaymentAction,
  saveInvoiceClubSettingsAction,
  saveInvoiceRemindersAction,
  sendInvoiceAction,
  updateInvoiceAction,
  voidInvoiceAction,
} from "../../../../../lib/invoicing/actions";

export function InvoicePage({
  invoice,
  today,
  canInvoice,
  org,
  reminders,
  clubSettings,
  fromEmail,
  backHref,
  backLabel,
}: {
  invoice: Invoice;
  today: string;
  canInvoice: boolean;
  org: OrgSettings;
  reminders: ReminderSettings;
  clubSettings: InvoiceClubSettings;
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
      clubSettings={clubSettings}
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
        await updateInvoiceAction(invoice.id, {
          reminderFreq: next.freq,
          reminderStartDays: next.startDays,
          reminderUntilPaid: next.untilPaid,
        });
        router.refresh();
      }}
      onClubRemindersChange={async (next) => {
        await saveInvoiceRemindersAction(next);
        router.refresh();
      }}
      onClubMailCopies={async (next) => {
        await saveInvoiceClubSettingsAction({ ...clubSettings, ...next });
        router.refresh();
      }}
      onInvoiceMailCopies={async (next) => {
        await updateInvoiceAction(invoice.id, { ccEmails: next.ccEmails, bccEmails: next.bccEmails });
        router.refresh();
      }}
      onInvoiceRemindersOverride={async (next) => {
        await updateInvoiceAction(invoice.id, {
          reminderFreq: next?.freq ?? null,
          reminderStartDays: next?.startDays ?? null,
          reminderUntilPaid: next?.untilPaid ?? null,
        });
        router.refresh();
      }}
      onVoid={async () => {
        const res = await voidInvoiceAction(invoice.id);
        if (!res.error) router.refresh();
        return res;
      }}
    />
  );
}
