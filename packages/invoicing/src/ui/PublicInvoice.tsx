"use client";

import type { OrgSettings } from "../adapter";
import { computeInvoice, formatDay, formatMoney } from "../logic";
import type { Invoice } from "../types";
import { PayInstructions } from "./PayInstructions";
import { Card, Cap, StatusPill } from "./parts";
import { t } from "./theme";

export function PublicInvoice({ invoice, today, org, brandingName }: { invoice: Invoice; today: string; org: OrgSettings; brandingName: string }) {
  const tot = computeInvoice(invoice, today);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640, margin: "0 auto", padding: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>{brandingName}</div>
      <Cap>{invoice.number}</Cap>
      <h1 style={{ fontSize: 22, margin: 0 }}>{invoice.customerName}</h1>
      <div style={{ color: t.muted, fontSize: 13 }}>
        {invoice.eventLabel ?? "Invoice"} · issued {formatDay(invoice.issuedOn, true)}
      </div>
      <StatusPill status={tot.status} />
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
          <span>Total</span>
          <span>{formatMoney(tot.totalCents)}</span>
        </div>
        {invoice.depositCents > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Deposit {tot.depositPaid ? "(paid)" : `due ${formatDay(invoice.depositDueOn)}`}</span>
            <span>{formatMoney(invoice.depositCents)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Paid</span>
          <span>{formatMoney(tot.paidCents)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>
          <span>Balance</span>
          <span>{formatMoney(tot.balanceCents)}</span>
        </div>
      </Card>
      <Card>
        <Cap>Line items</Cap>
        {invoice.lines.map((l) => (
          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, padding: "6px 0", borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))" }}>
            <span>
              {l.description} · {l.qty} × {formatMoney(l.unitCents)}
            </span>
            <b>{formatMoney(l.qty * l.unitCents)}</b>
          </div>
        ))}
      </Card>
      <PayInstructions invoice={invoice} totals={tot} org={org} />
    </div>
  );
}
