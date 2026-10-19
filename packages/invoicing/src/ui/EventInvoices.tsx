"use client";

import type { InvoicingPaths } from "../adapter";
import { computeInvoice, formatDay, formatMoney } from "../logic";
import type { EventCollection, Invoice } from "../types";
import { Btn, Progress, StatusPill } from "./parts";
import { t } from "./theme";

export function EventInvoices({
  eventLabel,
  invoices,
  summary,
  today,
  feeCents,
  depositDueOn,
  balanceDueOn,
  checklistHref,
  paths,
}: {
  eventLabel: string;
  invoices: Invoice[];
  summary: EventCollection;
  today: string;
  feeCents?: number;
  depositDueOn?: string | null;
  balanceDueOn?: string | null;
  checklistHref?: string;
  paths: InvoicingPaths;
}) {
  const T = summary.billedCents;
  const P = summary.collectedCents;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Btn sm href={paths.list}>
        ‹ Invoices
      </Btn>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>Finances · Event</div>
          <h1 style={{ fontSize: 22, margin: 0 }}>{eventLabel}</h1>
          <div style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>
            {summary.invoiceCount} programs · {summary.teamCount} teams
            {feeCents != null ? ` at ${formatMoney(feeCents)}` : ""}
            {depositDueOn ? ` · deposit due ${formatDay(depositDueOn, true)}` : ""}
            {balanceDueOn ? ` · balance due ${formatDay(balanceDueOn, true)}` : ""}
          </div>
        </div>
        {checklistHref && (
          <div style={{ marginLeft: "auto" }}>
            <Btn sm href={checklistHref}>
              Hosting checklist
            </Btn>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Kpi label="Billed" value={formatMoney(T)} sub={`${summary.invoiceCount} invoices`} />
        <Kpi label="Collected" value={formatMoney(P)} sub={`${T ? Math.round((P / T) * 100) : 0}% · Venmo + checks`} />
        <Kpi label="Balance" value={formatMoney(T - P)} sub="still owed" error={T - P > 0} />
        <Kpi label="Deposits" value={`${summary.depositPaidCount} of ${summary.invoiceCount}`} sub="paid" />
      </div>
      <Progress pct={T ? (P / T) * 100 : 0} />
      <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, overflow: "hidden" }}>
        {invoices.map((v) => {
          const tot = computeInvoice(v, today);
          return (
            <a
              key={v.id}
              href={paths.detail(v.id)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1.6fr) 90px 90px 90px 96px",
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))",
                fontSize: 13.5,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span>
                <b>{v.customerName}</b>
              </span>
              <span style={{ textAlign: "right" }}>
                <small style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: t.muted }}>Billed</small>
                {formatMoney(tot.totalCents)}
              </span>
              <span style={{ textAlign: "right" }}>
                <small style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: t.muted }}>Paid</small>
                {formatMoney(tot.paidCents)}
              </span>
              <span style={{ textAlign: "right" }}>
                <small style={{ display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: t.muted }}>Balance</small>
                <b>{formatMoney(tot.balanceCents)}</b>
              </span>
              <span>
                <StatusPill status={tot.status} />
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, error }: { label: string; value: string; sub: string; error?: boolean }) {
  return (
    <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>{label}</div>
      <b style={{ display: "block", fontSize: 22, marginTop: 6, color: error ? t.error : t.fg }}>{value}</b>
      <small style={{ color: t.muted, fontSize: 12 }}>{sub}</small>
    </div>
  );
}
