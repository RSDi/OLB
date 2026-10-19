"use client";

import { InvoicesList } from "invoicing/ui";
import type { Invoice } from "invoicing";
import { olbInvoicePaths } from "../../../lib/invoicing/paths";
import { InvoicingGmailCard } from "./InvoicingGmailCard";

export function InvoicesView({ invoices, today, canInvoice }: { invoices: Invoice[]; today: string; canInvoice: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {canInvoice && <InvoicingGmailCard />}
      <div data-tour="invoices-list">
        <InvoicesList invoices={invoices} today={today} canInvoice={canInvoice} paths={olbInvoicePaths} title="Invoices" />
      </div>
    </div>
  );
}
