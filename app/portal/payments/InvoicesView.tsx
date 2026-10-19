"use client";

import { InvoicesList } from "invoicing/ui";
import type { Invoice } from "invoicing";
import { olbInvoicePaths } from "../../../lib/invoicing/paths";

export function InvoicesView({ invoices, today, canInvoice }: { invoices: Invoice[]; today: string; canInvoice: boolean }) {
  return (
    <div data-tour="invoices-list">
      <InvoicesList invoices={invoices} today={today} canInvoice={canInvoice} paths={olbInvoicePaths} title="Invoices" />
    </div>
  );
}
