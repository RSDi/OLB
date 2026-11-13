"use client";

import { useState } from "react";
import type { InvoicingPaths } from "../adapter";
import { computeInvoice, formatDay, formatMoney } from "../logic";
import type { EventCollection, Invoice } from "../types";
import { ActionBtn, Btn, Progress, StatusPill } from "./parts";
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
  rateLabel,
  canInvoice = false,
  onVoidAll,
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
  /** Replaces "N teams at $fee", e.g. "9 teams · 26 games at $105/game". */
  rateLabel?: string;
  canInvoice?: boolean;
  /** Voids every live invoice for the event; shown with a confirm. */
  onVoidAll?: () => Promise<{ error?: string; notice?: string } | void>;
  paths: InvoicingPaths;
}) {
  const [busy, setBusy] = useState(false);
  const [voidMsg, setVoidMsg] = useState<{ error?: string; notice?: string } | null>(null);
  const live = invoices.filter((v) => !v.voidedAt);
  const withPayments = live.filter((v) => v.payments.length > 0).length;
  async function voidAll() {
    if (!onVoidAll || busy) return;
    const n = live.length;
    const paid = withPayments ? ` ${withPayments} of them ${withPayments === 1 ? "has" : "have"} payments recorded; those drop out of the collected total too.` : "";
    if (
      !confirm(
        `Void all ${n} ${n === 1 ? "invoice" : "invoices"} for ${eventLabel}? They drop out of billed and collected totals, and the programs aren't emailed.${paid} You can bill again afterward.`
      )
    )
      return;
    setBusy(true);
    setVoidMsg(null);
    const res = await onVoidAll();
    setBusy(false);
    setVoidMsg(res ?? null);
  }
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
            {summary.invoiceCount} programs ·{" "}
            {rateLabel ?? `${summary.teamCount} teams${feeCents != null ? ` at ${formatMoney(feeCents)}` : ""}`}
            {depositDueOn ? ` · deposit due ${formatDay(depositDueOn, true)}` : ""}
            {balanceDueOn ? ` · balance due ${formatDay(balanceDueOn, true)}` : ""}
          </div>
        </div>
        {(checklistHref || (onVoidAll && live.length > 0)) && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {onVoidAll && live.length > 0 && <ActionBtn sm canInvoice={canInvoice} label={busy ? "Voiding…" : "Void all"} kind="ghost" onClick={voidAll} />}
            {checklistHref && (
              <Btn sm href={checklistHref}>
                Hosting checklist
              </Btn>
            )}
          </div>
        )}
      </div>
      {voidMsg?.error && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{voidMsg.error}</div>}
      {voidMsg?.notice && <div style={{ color: t.muted, fontWeight: 700, fontSize: 13 }}>{voidMsg.notice}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Kpi label="Billed" value={formatMoney(T)} sub={`${summary.invoiceCount} invoices`} />
        <Kpi label="Collected" value={formatMoney(P)} sub={`${T ? Math.round((P / T) * 100) : 0}% · Venmo + checks`} />
        <Kpi label="Balance" value={formatMoney(T - P)} sub="still owed" error={T - P > 0} />
        <Kpi label="Deposits" value={`${summary.depositPaidCount} of ${summary.depositInvoiceCount}`} sub={summary.depositInvoiceCount ? "invoices with a deposit" : "no deposits"} />
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
