"use client";

import { useMemo, useState } from "react";
import type { InvoicingPaths } from "../adapter";
import { computeInvoice, eventCollection, formatMoney, STATUS_FILTERS } from "../logic";
import type { Invoice, InvoiceStatus } from "../types";
import { ActionBtn, Cap, Progress, StatusPill } from "./parts";
import { t } from "./theme";

export function InvoicesList({
  invoices,
  today,
  canInvoice,
  paths,
  title = "Invoices",
  subtitle = "Invoices to other programs: team fees, co-host splits, gym shares. Paid by Venmo or check.",
}: {
  invoices: Invoice[];
  today: string;
  canInvoice: boolean;
  paths: InvoicingPaths;
  title?: string;
  subtitle?: string;
}) {
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const rows = invoices.map((v) => ({ v, tot: computeInvoice(v, today) }));
  const vis = filter === "all" ? rows : rows.filter((r) => r.tot.status === filter);
  const open = rows.filter((r) => r.v.sentAt && r.tot.status !== "Paid");
  const over = rows.filter((r) => r.tot.status === "Overdue");
  const collected = rows.reduce((s, r) => s + r.tot.paidCents, 0);
  const drafts = rows.filter((r) => !r.v.sentAt).length;

  const events = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const v of invoices) {
      if (!v.hostEventId) continue;
      const list = map.get(v.hostEventId) ?? [];
      list.push(v);
      map.set(v.hostEventId, list);
    }
    return [...map.entries()].map(([id, list]) => ({ id, label: list[0].eventLabel || id, summary: eventCollection(id, list) }));
  }, [invoices]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>{title}</h1>
          <div style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>{subtitle}</div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <ActionBtn canInvoice={canInvoice} label="+ New invoice" kind="accent" onClick={() => (window.location.href = paths.create)} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <Kpi label="Outstanding" value={formatMoney(open.reduce((s, r) => s + r.tot.balanceCents, 0))} sub={`${open.length} open invoices`} />
        <Kpi label="Overdue" value={formatMoney(over.reduce((s, r) => s + r.tot.balanceCents, 0))} sub={`${over.length} invoice${over.length === 1 ? "" : "s"}`} error />
        <Kpi label="Collected" value={formatMoney(collected)} sub="Venmo + checks" />
        <Kpi label="Drafts" value={String(drafts)} sub="not sent" />
      </div>

      {events.map((e) => (
        <a
          key={e.id}
          href={paths.event(e.id)}
          style={{ ...cardLink, textDecoration: "none", color: "inherit", display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Cap>Event · {e.label}</Cap>
            <b>
              {formatMoney(e.summary.collectedCents)} of {formatMoney(e.summary.billedCents)} collected
            </b>
            <div style={{ marginTop: 6 }}>
              <Progress pct={e.summary.billedCents ? (e.summary.collectedCents / e.summary.billedCents) * 100 : 0} />
            </div>
          </div>
          <b>›</b>
        </a>
      ))}

      <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
        <Chip on={filter === "all"} onClick={() => setFilter("all")} label="All" n={invoices.length} />
        {STATUS_FILTERS.map((s) => (
          <Chip key={s} on={filter === s} onClick={() => setFilter(s)} label={s} n={rows.filter((r) => r.tot.status === s).length} />
        ))}
      </div>

      <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, overflow: "hidden" }}>
        {vis.length === 0 && <div style={{ padding: "16px 14px", color: t.muted }}>No invoices</div>}
        {vis.map(({ v, tot }) => {
          let sub = `${v.number} · ${v.eventLabel ?? "—"} · due ${v.dueOn}`;
          if (v.depositCents > 0 && tot.status !== "Paid") {
            sub = `${v.number} · deposit ${tot.depositPaid ? "paid" : "unpaid"} · ${formatMoney(tot.balanceCents)} left`;
          }
          return (
            <a
              key={v.id}
              href={paths.detail(v.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 60,
                padding: "8px 14px",
                borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.customerName}</b>
                <small style={{ color: t.muted, fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</small>
              </div>
              <div style={{ flex: "none", textAlign: "right", fontWeight: 800 }}>
                {formatMoney(tot.totalCents)}
                <div style={{ marginTop: 4 }}>
                  <StatusPill status={tot.status} />
                </div>
              </div>
            </a>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", borderTop: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", fontWeight: 800, background: "var(--inv-hover, #f7f7f4)", gap: 10, flexWrap: "wrap" }}>
          <span>
            {vis.length} invoice{vis.length === 1 ? "" : "s"}
          </span>
          <span>
            Billed {formatMoney(vis.reduce((s, r) => s + r.tot.totalCents, 0))} · Balance {formatMoney(vis.reduce((s, r) => s + (r.v.sentAt ? r.tot.balanceCents : 0), 0))}
          </span>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, error }: { label: string; value: string; sub: string; error?: boolean }) {
  return (
    <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, padding: 14 }}>
      <Cap>{label}</Cap>
      <b style={{ display: "block", fontSize: 22, marginTop: 6, color: error && value !== "$0" ? t.error : t.fg }}>{value}</b>
      <small style={{ color: t.muted, fontSize: 12 }}>{sub}</small>
    </div>
  );
}

function Chip({ on, onClick, label, n }: { on: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: "none",
        minHeight: 38,
        padding: "0 12px",
        borderRadius: 100,
        border: `1px solid ${on ? "var(--inv-ink, #121214)" : "var(--inv-border, var(--gw-border, #e4e4df))"}`,
        background: on ? "var(--inv-ink, #121214)" : "var(--inv-elev, #fff)",
        color: on ? "#fff" : "inherit",
        fontWeight: 700,
        fontSize: 13,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
      }}
    >
      {label} <span style={{ color: on ? "var(--inv-accent, #f5d000)" : t.muted, fontSize: 12 }}>{n}</span>
    </button>
  );
}

const cardLink = {
  background: "var(--inv-elev, #fff)",
  border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))",
  borderRadius: 14,
  padding: "12px 14px",
  textAlign: "left" as const,
};
