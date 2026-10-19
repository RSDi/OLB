"use client";

import { useState, type CSSProperties } from "react";
import type { InvoicingPaths, OrgSettings } from "../adapter";
import { computeInvoice, depositPaid, formatDay, formatMoney } from "../logic";
import type { Invoice, RecordPaymentInput, ReminderSettings } from "../types";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { PayInstructions } from "./PayInstructions";
import { ReminderSettingsCard } from "./ReminderSettings";
import { ActionBtn, Btn, Card, Cap, Field, inputStyle, LockNote, StatusPill } from "./parts";
import { t } from "./theme";

export function InvoiceDetail({
  invoice,
  today,
  canInvoice,
  org,
  reminders,
  fromEmail,
  backHref,
  backLabel = "Invoices",
  onSend,
  onSaveDraft,
  onRecordPayment,
  onRemindersChange,
}: {
  invoice: Invoice;
  today: string;
  canInvoice: boolean;
  org: OrgSettings;
  paths?: InvoicingPaths;
  reminders: ReminderSettings;
  fromEmail: string;
  backHref: string;
  backLabel?: string;
  onSend: () => Promise<{ error?: string } | void>;
  onSaveDraft?: (patch: { dueOn?: string; depositCents?: number; depositDueOn?: string | null; lines?: { description: string; qty: number; unitCents: number }[] }) => Promise<{ error?: string } | void>;
  onRecordPayment: (input: RecordPaymentInput) => Promise<{ error?: string } | void>;
  onRemindersChange: (next: ReminderSettings) => void | Promise<void>;
}) {
  const tot = computeInvoice(invoice, today);
  const draft = !invoice.sentAt;
  const [payOpen, setPayOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState(invoice.lines.map((l) => String(l.qty)));
  const [dep, setDep] = useState(invoice.depositCents ? String(invoice.depositCents / 100) : "");
  const [depDue, setDepDue] = useState(invoice.depositDueOn ?? "");
  const [due, setDue] = useState(invoice.dueOn);

  async function send() {
    setBusy(true);
    setError(null);
    if (draft && onSaveDraft) {
      const saved = await onSaveDraft({
        dueOn: due,
        depositCents: Math.round((parseFloat(dep.replace(/[$,]/g, "")) || 0) * 100),
        depositDueOn: depDue || null,
        lines: invoice.lines.map((l, i) => ({ description: l.description, qty: parseInt(qty[i] || "0", 10) || 0, unitCents: l.unitCents })),
      });
      if (saved && saved.error) {
        setBusy(false);
        return setError(saved.error);
      }
    }
    const res = await onSend();
    setBusy(false);
    if (res && res.error) setError(res.error);
    else setNotice("Invoice sent.");
  }

  const timeline: { label: string; detail: string; done: boolean }[] = [
    { label: "Created", detail: invoice.issuedOn ? formatDay(invoice.issuedOn, true) : formatDay(invoice.createdAt.slice(0, 10), true), done: true },
    { label: "Sent", detail: invoice.sentAt ? formatDay(invoice.issuedOn || invoice.sentAt.slice(0, 10), true) : "—", done: !!invoice.sentAt },
    { label: "Viewed by program", detail: invoice.viewedAt ? formatDay(invoice.viewedAt.slice(0, 10), true) : "—", done: !!invoice.viewedAt },
  ];
  let run = 0;
  [...invoice.payments]
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn))
    .forEach((p) => {
      const crossed = invoice.depositCents && run < invoice.depositCents && run + p.amountCents >= invoice.depositCents;
      run += p.amountCents;
      timeline.push({
        label: `${p.method === "venmo" ? "Venmo" : "Check"} payment ${formatMoney(p.amountCents)}${crossed ? " · deposit paid" : ""}`,
        detail: formatDay(p.paidOn, true),
        done: true,
      });
    });
  if (invoice.depositCents && !depositPaid(invoice)) {
    timeline.push({
      label: "Deposit due",
      detail: `${formatDay(invoice.depositDueOn, true)} · ${formatMoney(invoice.depositCents - tot.paidCents)}${invoice.depositDueOn && invoice.depositDueOn < today ? " · late" : ""}`,
      done: false,
    });
  }
  timeline.push({
    label: tot.balanceCents ? "Balance due" : "Paid in full",
    detail: tot.balanceCents ? `${formatDay(invoice.dueOn, true)} · ${formatMoney(tot.balanceCents)}` : formatDay(invoice.payments.at(-1)?.paidOn, true),
    done: !tot.balanceCents,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Btn sm href={backHref}>
        ‹ {backLabel}
      </Btn>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <Cap>{invoice.number}</Cap>
          <h1 style={{ fontSize: 22, margin: 0 }}>{invoice.customerName}</h1>
          <div style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>
            {invoice.eventLabel ?? "Invoice"} · {invoice.issuedOn ? `issued ${formatDay(invoice.issuedOn, true)}` : "not sent yet"}
          </div>
        </div>
        <StatusPill status={tot.status} />
      </div>

      <Card>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 0, border: `1px solid var(--inv-border, var(--gw-border, #e4e4df))`, borderRadius: 12, overflow: "hidden" }}>
          <Sum label="Total" value={formatMoney(tot.totalCents)} em={`due ${formatDay(invoice.dueOn)}`} />
          <Sum
            label="Deposit"
            value={invoice.depositCents ? formatMoney(invoice.depositCents) : "—"}
            em={invoice.depositCents ? (tot.depositPaid ? "✓ Paid" : `Unpaid · due ${formatDay(invoice.depositDueOn)}`) : "None"}
            ok={invoice.depositCents ? tot.depositPaid : undefined}
          />
          <Sum label="Paid" value={formatMoney(tot.paidCents)} em={`${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"}`} />
          <Sum label="Balance" value={formatMoney(tot.balanceCents)} em={tot.balanceCents ? `due ${formatDay(invoice.dueOn)}` : "Paid in full"} error={!!tot.balanceCents && tot.status === "Overdue"} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {tot.balanceCents > 0 && invoice.sentAt && <ActionBtn canInvoice={canInvoice} label="Mark as paid" kind="accent" onClick={() => setPayOpen(true)} />}
          <ActionBtn canInvoice={canInvoice} label={draft ? "Send invoice" : "Resend invoice"} kind="ink" onClick={send} />
        </div>
        <LockNote show={!canInvoice} />
        {error && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{error}</div>}
        {notice && <div style={{ fontWeight: 700, fontSize: 13 }}>{notice}</div>}
        {busy && <div style={{ fontSize: 13, color: t.muted }}>Working…</div>}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)", gap: 14, alignItems: "start" }} className="inv-two">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Card>
            <Cap>Line items</Cap>
            <div>
              <div style={liGrid} className="inv-li">
                <span>Item</span>
                <span style={{ textAlign: "right" }}>Qty</span>
                <span style={{ textAlign: "right" }}>Rate</span>
                <span style={{ textAlign: "right" }}>Amount</span>
              </div>
              {invoice.lines.map((l, i) => (
                <div key={l.id} style={{ ...liGrid, borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))" }} className="inv-li">
                  <span>{l.description}</span>
                  <span>
                    {draft && canInvoice ? (
                      <input
                        inputMode="numeric"
                        value={qty[i] ?? ""}
                        onChange={(e) => setQty(qty.map((q, j) => (j === i ? e.target.value : q)))}
                        style={{ ...inputStyle, minHeight: 36, textAlign: "center" }}
                      />
                    ) : (
                      <span style={{ display: "block", textAlign: "right" }}>{l.qty}</span>
                    )}
                  </span>
                  <span style={{ textAlign: "right" }}>{formatMoney(l.unitCents)}</span>
                  <span style={{ textAlign: "right" }}>{formatMoney(l.qty * l.unitCents)}</span>
                </div>
              ))}
              <div style={{ ...liGrid, border: 0, fontWeight: 900, fontSize: 15 }} className="inv-li">
                <span>Total</span>
                <span />
                <span />
                <span style={{ textAlign: "right" }}>{formatMoney(tot.totalCents)}</span>
              </div>
            </div>
            <Cap>Due dates</Cap>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Deposit (optional)">
                <input style={inputStyle} inputMode="numeric" value={dep} placeholder="No deposit" disabled={!canInvoice || !draft} onChange={(e) => setDep(e.target.value)} />
              </Field>
              <Field label="Deposit due">
                <input style={inputStyle} type="date" value={depDue} disabled={!canInvoice || !draft} onChange={(e) => setDepDue(e.target.value)} />
              </Field>
              <Field label="Balance due">
                <input style={inputStyle} type="date" value={due} disabled={!canInvoice || !draft} onChange={(e) => setDue(e.target.value)} />
              </Field>
              <Field label="Balance remaining">
                <b style={{ fontSize: 20, color: t.fg, minHeight: 44, display: "flex", alignItems: "center" }}>{formatMoney(tot.balanceCents)}</b>
              </Field>
            </div>
          </Card>
          <PayInstructions invoice={invoice} totals={tot} org={org} />
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "90px minmax(0,1fr)", gap: "6px 10px", fontSize: 13 }}>
              <span style={{ color: t.muted, fontWeight: 600 }}>From</span>
              <span>
                <b>{org.fromName}</b>
                <br />
                {org.fromEmail}
              </span>
              <span style={{ color: t.muted, fontWeight: 600 }}>To</span>
              <span>
                <b>{invoice.customerName}</b>
                <br />
                {invoice.customerEmail || "No email on file"}
              </span>
            </div>
          </Card>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Card>
            <Cap>Payments</Cap>
            {invoice.payments.length === 0 && <div style={{ fontSize: 13, color: t.muted }}>No payments yet.</div>}
            {invoice.payments.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))" }}>
                <span>
                  <b>{p.method === "venmo" ? "Venmo" : "Check"}</b> · {formatDay(p.paidOn, true)}
                  <small style={{ display: "block", color: t.muted }}>{p.method === "check" ? `Check #${p.reference || "—"}` : p.reference || "—"}</small>
                </span>
                <b>{formatMoney(p.amountCents)}</b>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, paddingTop: 8 }}>
              <span>Balance remaining</span>
              <span>{formatMoney(tot.balanceCents)}</span>
            </div>
            {tot.balanceCents > 0 && invoice.sentAt && <ActionBtn canInvoice={canInvoice} label="Mark as paid" kind="ghost" sm onClick={() => setPayOpen(true)} />}
          </Card>
          <ReminderSettingsCard settings={reminders} canInvoice={canInvoice} invoice={invoice} fromEmail={fromEmail} onChange={onRemindersChange} />
          <Card>
            <Cap>Status</Cap>
            <div style={{ display: "flex", flexDirection: "column", paddingLeft: 6 }}>
              {timeline.map((item, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    padding: "0 0 14px 20px",
                    fontSize: 13,
                    borderLeft: i === timeline.length - 1 ? "2px solid transparent" : "2px solid var(--inv-border, var(--gw-border, #e4e4df))",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: -7,
                      top: 1,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: item.done ? t.accent : t.elev,
                      border: `2px solid ${item.done ? "var(--inv-ink, #121214)" : "var(--inv-border, var(--gw-border, #e4e4df))"}`,
                    }}
                  />
                  <b>{item.label}</b>
                  <small style={{ display: "block", color: t.muted }}>{item.detail || "—"}</small>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      {payOpen && <MarkPaidDialog invoice={invoice} today={today} onClose={() => setPayOpen(false)} onSave={onRecordPayment} />}
    </div>
  );
}

function Sum({ label, value, em, ok, error }: { label: string; value: string; em: string; ok?: boolean; error?: boolean }) {
  return (
    <div style={{ padding: "10px 12px", borderRight: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", minWidth: 0 }}>
      <small style={{ display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: t.muted }}>{label}</small>
      <b style={{ display: "block", fontSize: 17, marginTop: 3, fontVariantNumeric: "tabular-nums", color: error ? t.error : t.fg }}>{value}</b>
      <em style={{ fontStyle: "normal", fontSize: 11.5, fontWeight: 700, color: ok === true ? t.ok : ok === false ? t.error : t.muted }}>{em}</em>
    </div>
  );
}

const liGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0,1fr) 50px 80px 84px",
  gap: 8,
  alignItems: "center",
  fontSize: 13.5,
  padding: "8px 0",
};
