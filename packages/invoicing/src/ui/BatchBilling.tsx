"use client";

import { useState } from "react";
import { batchCustomerEligible, batchPreviewTotals, customerBillLines, customerBillTotal, formatDay, formatMoney, invoiceAlreadyBilled, parseEmailList, reminderCopy } from "../logic";
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
  invoicesError = null,
  rateLabel,
  unitLabel,
  emailsNote,
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
  invoicesError?: string | null;
  /** How the host prices it, e.g. "$105/game". Default: the fee per team. */
  rateLabel?: string;
  /** What customers' unitCount counts, plural ("games"). */
  unitLabel?: string;
  /** Where the host's emails come from, shown above the programs. */
  emailsNote?: string;
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
  // Emails typed on this page for one program's invoice, by customer id.
  const [typedEmails, setTypedEmails] = useState<Record<string, string>>({});
  const [editingEmails, setEditingEmails] = useState<string | null>(null);
  const typedParsed = Object.fromEntries(Object.entries(typedEmails).map(([id, raw]) => [id, parseEmailList(raw)]));
  const emailsBad = Object.values(typedParsed).some((r) => !r.ok);

  const depCents = Math.round((parseFloat(dep.replace(/[$,]/g, "")) || 0) * 100);
  const preview = invoicesError
    ? { invoiceCount: 0, teamCount: 0, totalCents: 0, depositCents: 0, alreadyBilledCount: 0 }
    : batchPreviewTotals(customers, feeCents, depOn ? depCents : 0, invoices);
  const teams = preview.teamCount;
  const rate = rateLabel ?? `${formatMoney(feeCents)}/team`;
  const units = unitLabel
    ? customers.filter((c) => !invoicesError && batchCustomerEligible(c, invoices)).reduce((n, c) => n + (c.unitCount ?? 0), 0)
    : null;
  const G = preview.totalCents;
  const DP = preview.depositCents;
  const billed = preview.invoiceCount;
  const actionsOff = !!invoicesError || billed === 0 || emailsBad;

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
      customers: customers.map((c) => {
        const typed = typedParsed[c.id];
        return typed?.ok ? { id: c.id, teamCount: c.teamCount, emails: typed.data } : { id: c.id, teamCount: c.teamCount };
      }),
      ccEmails: overrideCopy ? cc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : null,
      bccEmails: overrideCopy ? bcc.split(/[,;]+/).map((s) => s.trim()).filter(Boolean) : null,
    };
  }

  async function go(send: boolean) {
    if (actionsOff) return;
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
          <b>{rate}</b> · {depOn ? `deposit ${formatMoney(depCents)}/team due ${formatDay(depDue)}` : "no deposit"} · balance due {formatDay(due)}
        </span>
        <em style={{ fontStyle: "normal", fontWeight: 800 }}>{setOpen ? "Hide ▴" : "Edit ▾"}</em>
      </button>

      {setOpen && (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Field label="Event">
              <input style={inputStyle} value={eventLabel} readOnly />
            </Field>
            <Field label={rateLabel ? "Rate" : "Fee per team"}>
              <input style={inputStyle} value={rate} readOnly />
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
          <small style={{ color: t.muted }}>Programs and team counts{unitLabel ? ` and ${unitLabel}` : ""} come from the Teams tab (visiting teams). If a count is wrong, change it there and come back. Change under a program sets its emails for this invoice only. Reminders: {reminderCopy(reminders, due, fromEmail).toLowerCase()}</small>
        </Card>
      )}

      {emailsNote && <small style={{ color: t.muted, fontSize: 12.5, marginBottom: -6 }}>{emailsNote}</small>}
      <div style={{ background: "var(--inv-elev, #fff)", border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", borderRadius: 14, overflow: "hidden" }}>
        {customers.map((p) => {
          const billedAlready = !invoicesError && invoiceAlreadyBilled(invoices, p.id);
          const eligible = !invoicesError && batchCustomerEligible(p, invoices);
          const lines = p.lines?.length ? customerBillLines(p, feeCents, "") : [];
          return (
            <div key={p.id} style={{ borderBottom: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", opacity: eligible || invoicesError ? 1 : 0.55 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto 96px",
                gap: 8,
                alignItems: "center",
                padding: "10px 14px",
              }}
            >
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</b>
                <Emails
                  customer={p}
                  canChange={canInvoice && eligible}
                  editing={editingEmails === p.id}
                  typed={typedEmails[p.id]}
                  onEdit={() => setEditingEmails(p.id)}
                  onDone={() => setEditingEmails(null)}
                  onType={(raw) => setTypedEmails({ ...typedEmails, [p.id]: raw })}
                  onReset={() => {
                    const next = { ...typedEmails };
                    delete next[p.id];
                    setTypedEmails(next);
                    setEditingEmails(null);
                  }}
                />
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.muted, whiteSpace: "nowrap" }}>
                {p.teamCount} {p.teamCount === 1 ? "team" : "teams"}
                {unitLabel && p.unitCount != null ? ` · ${p.unitCount} ${unitLabel}` : ""}
              </span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {invoicesError ? (
                  formatMoney(0)
                ) : billedAlready ? (
                  <small style={{ display: "block", color: t.muted, fontSize: 12 }}>already billed</small>
                ) : (
                  <>
                    {formatMoney(customerBillTotal(p, feeCents))}
                    <small style={{ display: "block", color: t.muted, fontSize: 12 }}>{depOn ? `deposit ${formatMoney(p.teamCount * depCents)}` : "no deposit"}</small>
                  </>
                )}
              </span>
            </div>
            {lines.length > 0 && (
              <div style={{ padding: "0 14px 10px 26px", display: "flex", flexDirection: "column", gap: 2 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12, color: t.muted }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{l.description}</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {l.qty} × {formatMoney(l.unitCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 14px 6px", fontWeight: 900, fontSize: 15 }}>
          <span>
            {billed} invoices · {teams} teams
            {units != null ? ` · ${units} ${unitLabel}` : ""}
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
      {invoicesError && <div style={{ color: t.error, fontWeight: 700 }}>{invoicesError}</div>}
      {error && <div style={{ color: t.error, fontWeight: 700 }}>{error}</div>}
      {canInvoice && (
        <Btn kind="ghost" onClick={() => go(false)} disabled={busy || actionsOff}>
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
          <Btn kind="accent" sm onClick={() => setConfirm(true)} disabled={busy || actionsOff}>
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

// A program's emails under its name: the host's, or what was typed here for
// this invoice; Change edits them, Edit contact opens where they come from.
function Emails({
  customer,
  canChange,
  editing,
  typed,
  onEdit,
  onDone,
  onType,
  onReset,
}: {
  customer: EventCustomer;
  canChange: boolean;
  editing: boolean;
  typed: string | undefined;
  onEdit: () => void;
  onDone: () => void;
  onType: (raw: string) => void;
  onReset: () => void;
}) {
  const parsed = typed !== undefined ? parseEmailList(typed) : null;
  if (editing) {
    return (
      <span style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
        <input
          style={inputStyle}
          autoFocus
          aria-label={`Emails for ${customer.name}`}
          value={typed ?? customer.emails.join(", ")}
          placeholder="coach@example.com, director@example.com"
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onDone();
          }}
        />
        {parsed && !parsed.ok && <small style={{ color: t.error, fontWeight: 700, fontSize: 12 }}>{parsed.error}</small>}
        <span style={{ display: "flex", gap: 12, fontSize: 12 }}>
          <button type="button" onClick={onDone} style={linkBtn}>
            Done
          </button>
          {typed !== undefined && (
            <button type="button" onClick={onReset} style={linkBtn}>
              Use the contact&apos;s emails
            </button>
          )}
        </span>
      </span>
    );
  }
  const shown = parsed?.ok ? parsed.data : customer.emails;
  return (
    <small style={{ color: t.muted, fontSize: 12, display: "block" }}>
      {shown.length ? shown.join(", ") : "No email"}
      {typed !== undefined && <b style={{ color: t.fg }}> · this invoice only</b>}
      {canChange && (
        <>
          {" · "}
          <button type="button" onClick={onEdit} style={linkBtn}>
            Change
          </button>
        </>
      )}
      {customer.emailsHref && (
        <>
          {" · "}
          <a href={customer.emailsHref} style={{ color: "inherit", textUnderlineOffset: 3 }}>
            Edit contact
          </a>
        </>
      )}
    </small>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  font: "inherit",
  fontWeight: 700,
  color: "inherit",
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};
