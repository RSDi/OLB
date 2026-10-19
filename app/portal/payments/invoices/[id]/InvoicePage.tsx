"use client";

import { useRouter } from "next/navigation";
import { InvoiceDetail } from "invoicing/ui";
import type { Invoice, InvoiceClubSettings, OrgSettings, RecordPaymentInput, UpdateInvoiceInput } from "invoicing";
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
  clubSettings,
  fromEmail,
  backHref,
  backLabel,
}: {
  invoice: Invoice;
  today: string;
  canInvoice: boolean;
  org: OrgSettings;
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
        const res = await updateInvoiceAction(invoice.id, {
          reminderFreq: next.freq,
          reminderStartDays: next.startDays,
          reminderUntilPaid: next.untilPaid,
        });
        if (!res.error) router.refresh();
        return res;
      }}
      onClubRemindersChange={async (next) => {
        const res = await saveInvoiceRemindersAction(next);
        if (!res.error) router.refresh();
        return res;
      }}
      onClubMailCopies={async (next) => {
        const res = await saveInvoiceClubSettingsAction({ ...clubSettings, ...next });
        if (!res.error) router.refresh();
        return res;
      }}
      onInvoiceMailCopies={async (next) => {
        const res = await updateInvoiceAction(invoice.id, { ccEmails: next.ccEmails, bccEmails: next.bccEmails });
        if (!res.error) router.refresh();
        return res;
      }}
      onInvoiceRemindersOverride={async (next) => {
        const res = await updateInvoiceAction(invoice.id, {
          reminderFreq: next?.freq ?? null,
          reminderStartDays: next?.startDays ?? null,
          reminderUntilPaid: next?.untilPaid ?? null,
        });
        if (!res.error) router.refresh();
        return res;
      }}
      onVoid={async () => {
        const res = await voidInvoiceAction(invoice.id);
        if (!res.error) router.refresh();
        return res;
      }}
    />
  );
}
