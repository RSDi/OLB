"use client";

import { useState } from "react";
import { batchCustomerEligible, batchPreviewTotals, formatDay, formatMoney, invoiceAlreadyBilled, reminderCopy } from "../logic";
import type { BatchInput, EventCustomer, Invoice, ReminderSettings } from "../types";
import { ActionBtn, Btn, Card, Field, inputStyle, LockNote } from "./parts";
import { t } from "./theme";

export function BatchBilling({
  eventId,
  eventLabel,
  feeCents,
  customers,
  dueOn,
  depositOn,
  depositPerTeamCents,
  depositDueOn,
  canInvoice,
  reminders,
  clubCc = [],
  clubBcc = [],
  fromEmail,
  backHref,
  invoices = [],
  onSubmit,
}: {
  eventId: string;
  eventLabel: string;
  feeCents: number;
  customers: EventCustomer[];
  dueOn: string;
  depositOn: boolean;
  depositPerTeamCents: number;
  depositDueOn: string;
  canInvoice: boolean;
  reminders: ReminderSettings;
  clubCc?: string[];
  clubBcc?: string[];
  fromEmail: string;
  backHref: string;
  invoices?: Pick<Invoice, "hostCustomerId" | "sentAt" | "voidedAt">[];
  onSubmit: (input: BatchInput, send: boolean) => Promise<{ error?: string } | void>;
}) {
  const [due, setDue] = useState(dueOn);
  const [depOn, setDepOn] = useState(depositOn);
  const [dep, setDep] = useState(String(depositPerTeamCents / 100));
  const [depDue, setDepDue] = useState(depositDueOn);
  const [setOpen, setSetOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overrideCopy, setOverrideCopy] = useState(false);
  const [cc, setCc] = useState(clubCc.join(", "));
  const [bcc, setBcc] = useState(clubBcc.join(", "));

  const depCents = Math.round((parseFloat(dep.replace(/[$,]/g, "")) || 0) * 100);
  const preview = batchPreviewTotals(customers, feeCents, depOn ? depCents : 0, invoices);
  const teams = preview.teamCount;
  const G = preview.totalCents;
  const DP = preview.depositCents;
  const billed = preview.invoiceCount;

  function payload(): BatchInput {
    return {
      eventId,
      eventLabel,
      feeCents,
      dueOn: due,
      depositOn: depOn,
      depositPerTeamCents: depCents,
      depositDueOn: depOn ? depDue : null,
      lineDescription: `Team fee · ${eventLabel}`,
      customers: customers.map((c) => ({ id: c.id, teamCount: c.teamCount })),
      ccEmails: overrideCopy ? cc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : null,
      bccEmails: overrideCopy ? bcc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : null,
    };
  }

  async function go(send: boolean) {
    setBusy(true);
    setError(null);
    const res = await onSubmit(payload(), send);
    setBusy(false);
    if (res && res.error) setError(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Btn sm href={backHref}>
          ‹ Checklist
        </Btn>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>Finances · Batch billing</div>
        <h1 style={{ fontSize: 22, margin: 0 }}>Bill programs for {eventLabel}</h1>
        <div style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Pre-filled from the hosting checklist. One invoice per program, paid by Venmo or check.</div>
      </div>

      <button
        type="button"
        onClick={() => setSetOpen(!setOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          textAlign: "left",
          background: "var(--inv-elev, #fff)",
          border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))",
          borderRadius: 12,
          padding: "10px 12px",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        <span style={{ flex: 1 }}>
          <b>{formatMoney(feeCents)}/team</b> · {depOn ? `deposit ${formatMoney(depCents)}/team due ${formatDay(depDue)}` : "no deposit"} · balance due {formatDay(due)}
        </span>
        <em style={{ fontStyle: "normal", fontWeight: 800 }}>{setOpen ? "Hide ▴" : "Edit ▾"}</em>
      </button>

      {setOpen && (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Field label="Event">
              <input style={inputStyle} value={eventLabel} readOnly />
            </Field>
            <Field label="Fee per team">
              <input style={inputStyle} value={formatMoney(feeCents)} readOnly />
            </Field>
            <Field label="Balance due">
              <input style={inputStyle} type="date" value={due} disabled={!canInvoice} onChange={(e) => setDue(e.target.value)} />
            </Field>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 36, fontWeight: 600 }}>
            <input type="checkbox" checked={depOn} disabled={!canInvoice} onChange={(e) => setDepOn(e.target.checked)} />
            Ask for a deposit (optional)
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Deposit per team">
              <input style={inputStyle} inputMode="numeric" value={dep} disabled={!depOn || !canInvoice} onChange={(e) => setDep(e.target.value)} />
            </Field>
            <Field label="Deposit due">
              <input style={inputStyle} type="date" value={depDue} disabled={!depOn || !canInvoice} onChange={(e) => setDepDue(e.target.value)} />
            </Field>
          </div>
          <small style={{ color: t.muted }}>Programs and team counts come from the Teams tab (visiting teams). If a count is wrong, change it there and come back. Reminders: {reminderCopy(reminders, due, fromEmail).toLowerCase()}</small>
        </Card>
      )}

      <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, overflow: "hidden" }}>
        {customers.map((p) => {
          const billedAlready = invoiceAlreadyBilled(invoices, p.id);
          const eligible = batchCustomerEligible(p, invoices);
          return (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto 96px",
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))",
                opacity: eligible ? 1 : 0.55,
              }}
            >
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                <small style={{ color: t.muted, fontSize: 12 }}>{p.emails.length ? p.emails.join(", ") : "No email"}</small>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.muted, whiteSpace: "nowrap" }}>
                {p.teamCount} {p.teamCount === 1 ? "team" : "teams"}
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {billedAlready ? (
                  <small style={{ display: "block", color: t.muted, fontSize: 12 }}>already billed</small>
                ) : (
                  <>
                    {formatMoney(p.teamCount * feeCents)}
                    <small style={{ display: "block", color: t.muted, fontSize: 12 }}>{depOn ? `deposit ${formatMoney(p.teamCount * depCents)}` : "no deposit"}</small>
                  </>
                )}
              </span>
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 14px 6px", fontWeight: 900, fontSize: 15 }}>
          <span>
            {billed} invoices · {teams} teams
            {preview.alreadyBilledCount > 0 ? (
              <small style={{ display: "block", fontWeight: 600, color: t.muted, fontSize: 12 }}>
                {preview.alreadyBilledCount} already billed
              </small>
            ) : null}
          </span>
          <span>{formatMoney(G)}</span>
        </div>
        <div style={{ padding: "0 14px 6px", fontSize: 12, fontWeight: 600, color: t.muted }}>
          Team counts come from the Teams tab (visiting teams). If a count is wrong, change it there and come back.
        </div>
        <div style={{ padding: "0 14px 14px", fontSize: 13, fontWeight: 700, color: t.muted, display: "flex", flexDirection: "column", gap: 2 }}>
          {depOn ? (
            <>
              <span>
                Deposits due {formatDay(depDue)}: {formatMoney(DP)}
              </span>
              <span>
                Balance due {formatDay(due)}: {formatMoney(G - DP)}
              </span>
            </>
          ) : (
            <span>Balance due {formatDay(due)}: {formatMoney(G)}</span>
          )}
        </div>
      </div>
      <Card>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <input type="checkbox" checked={overrideCopy} disabled={!canInvoice} onChange={(e) => setOverrideCopy(e.target.checked)} />
          Override CC/BCC for this batch
        </label>
        <small style={{ color: t.muted }}>Club default CC: {clubCc.join(", ") || "none"} · BCC: {clubBcc.join(", ") || "none"}</small>
        {overrideCopy && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="CC">
              <input style={inputStyle} value={cc} disabled={!canInvoice} onChange={(e) => setCc(e.target.value)} placeholder="none" />
            </Field>
            <Field label="BCC">
              <input style={inputStyle} value={bcc} disabled={!canInvoice} onChange={(e) => setBcc(e.target.value)} placeholder="none" />
            </Field>
          </div>
        )}
      </Card>
      <LockNote show={!canInvoice} />
      {error && <div style={{ color: t.error, fontWeight: 700 }}>{error}</div>}
      {canInvoice && (
        <Btn kind="ghost" onClick={() => go(false)} disabled={busy}>
          Save all {billed} as drafts instead
        </Btn>
      )}

      <div
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 40,
          background: t.ink,
          color: "#fff",
          borderRadius: 14,
          padding: "10px 10px 10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <small style={{ display: "block", color: "rgba(255,255,255,.48)", fontSize: 11.5, fontWeight: 700 }}>
            {teams} teams · deposits {formatMoney(DP)} · balance {formatMoney(G - DP)}
          </small>
          <b style={{ fontSize: 20, color: "var(--inv-accent, #f5d000)" }}>{formatMoney(G)}</b>
        </div>
        {canInvoice ? (
          <Btn kind="accent" sm onClick={() => setConfirm(true)} disabled={busy || billed === 0}>
            Send all {billed}
          </Btn>
        ) : (
          <ActionBtn canInvoice={false} label="Send all" kind="accent" />
        )}
      </div>

      {confirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 95, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 10 }}>
          <Card style={{ width: "100%", maxWidth: 460 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: t.muted }}>Confirm · {eventLabel}</div>
            <b style={{ fontSize: 19 }}>
              Send {billed} invoices, {formatMoney(G)} total?
            </b>
            <div style={{ fontSize: 13, color: t.muted }}>
              Deposits {formatMoney(DP)} due {formatDay(depDue)} · balance due {formatDay(due)}. Venmo and check instructions on each.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn kind="ghost" onClick={() => setConfirm(false)} disabled={busy}>
                Cancel
              </Btn>
              <Btn
                kind="ink"
                onClick={async () => {
                  setConfirm(false);
                  await go(true);
                }}
                disabled={busy}
              >
                Send all
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
