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
import type { GmailBannerKind } from "../../../../../lib/invoicing/gmail-meta";

export function InvoicePage({
  invoice,
  today,
  canInvoice,
  org,
  clubSettings,
  fromEmail,
  backHref,
  backLabel,
  gmailBanner,
}: {
  invoice: Invoice;
  today: string;
  canInvoice: boolean;
  org: OrgSettings;
  clubSettings: InvoiceClubSettings;
  fromEmail: string;
  backHref: string;
  backLabel?: string;
  gmailBanner?: GmailBannerKind | null;
}) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {gmailBanner && canInvoice && (
        <div className="rsd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Reconnect Gmail</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
            {gmailBanner === "reconnect" ? (
              <>
                The last invoice email didn&apos;t go out because Gmail isn&apos;t connected anymore. The invoice stayed{" "}
                <strong>Draft</strong>. Connect Gmail again, then send.
              </>
            ) : (
              <>
                The last send failed, try again. The invoice stayed <strong>Draft</strong>.
              </>
            )}
          </p>
          <a
            href={
              "/api/invoicing/gmail/connect?next=" +
              encodeURIComponent(`/portal/payments/invoices/${invoice.id}`)
            }
            style={{ fontWeight: 700, fontSize: 13 }}
          >
            Reconnect Gmail
          </a>
        </div>
      )}
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
    </div>
  );
}
