"use client";

import { useRouter } from "next/navigation";
import { BatchBilling } from "invoicing/ui";
import type { BatchInput, EventCustomer, Invoice, InvoiceClubSettings } from "invoicing";
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
  invoices = [],
  invoicesError = null,
}: {
  weekendId: string;
  eventLabel: string;
  feeCents: number | null;
  customers: EventCustomer[];
  dueOn: string;
  depositDueOn: string;
  canInvoice: boolean;
  clubSettings: InvoiceClubSettings;
  fromEmail: string;
  invoices?: Invoice[];
  invoicesError?: string | null;
}) {
  const router = useRouter();
  if (feeCents == null) {
    return (
      <div className="rsd-card" style={{ padding: "32px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Set the team fee first</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
          Bill programs needs the team fee on the tournament plan. Ask a coach or the board to set it, then come back here.
        </div>
        <a href={`/portal/schedule/hosted/${weekendId}`} style={{ fontSize: 13, fontWeight: 700 }}>
          Back
        </a>
      </div>
    );
  }
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
      invoices={invoices}
      invoicesError={invoicesError}
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
