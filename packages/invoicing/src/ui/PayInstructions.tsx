"use client";

import type { OrgSettings } from "../adapter";
import { formatMoney } from "../logic";
import type { Invoice, InvoiceTotals } from "../types";
import { Card, Cap } from "./parts";

function memo(invoice: Invoice): string {
  const event = invoice.eventLabel?.trim();
  const name = invoice.customerName.trim();
  return event ? `${event} – ${name}` : name;
}

export function PayInstructions({ invoice, totals, org }: { invoice: Invoice; totals: InvoiceTotals; org: OrgSettings }) {
  const amount = formatMoney(totals.payNowCents);
  const deposit = invoice.depositCents > 0 && !totals.depositPaid;
  const addr = org.checkAddress.length ? org.checkAddress.join(", ") : "Reply for the mailing address";
  return (
    <Card>
      <Cap>How to pay (shown on the invoice)</Cap>
      <div style={{ border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
        <h4 style={{ margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "#008CFF", color: "#fff", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>V</span>
          Venmo
        </h4>
        <span>
          Send <b>{amount}</b>
          {deposit ? " (deposit)" : ""} to <b>@{org.venmoHandle}</b>
        </span>
        <code style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5, background: "var(--inv-bg, var(--gw-bg, #f3f3ef))", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 8, padding: "6px 8px", display: "block" }}>
          {org.venmoUrl.replace(/^https?:\/\//, "")}
        </code>
        <span>
          Note: <b>{memo(invoice)}</b>
        </span>
      </div>
      <div style={{ border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
        <h4 style={{ margin: 0, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--inv-ink, #121214)", color: "var(--inv-accent, #f5d000)", fontSize: 12, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          Check
        </h4>
        <span>
          Payable to <b>{org.checkPayee}</b>
        </span>
        <span>Mail to: {addr}</span>
        <span>
          Memo: <b>{memo(invoice)}</b>
        </span>
      </div>
    </Card>
  );
}
