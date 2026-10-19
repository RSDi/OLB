"use client";

import { useMemo, useState } from "react";
import { computeInvoice, formatMoney, invoiceBalance } from "../logic";
import type { Invoice, PaymentMethod, RecordPaymentInput } from "../types";
import { Btn, Card, Field, inputStyle } from "./parts";
import { cap, t } from "./theme";

export function MarkPaidDialog({
  invoice,
  today,
  onClose,
  onSave,
}: {
  invoice: Invoice;
  today: string;
  onClose: () => void;
  onSave: (input: RecordPaymentInput) => Promise<{ error?: string } | void>;
}) {
  const totals = computeInvoice(invoice, today);
  const [method, setMethod] = useState<PaymentMethod>("venmo");
  const [amount, setAmount] = useState(String(totals.payNowCents / 100));
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = Math.round((parseFloat(amount.replace(/[$,]/g, "")) || 0) * 100);
  const after = Math.max(0, invoiceBalance(invoice) - cents);
  const afterLabel = useMemo(() => `After this: balance ${formatMoney(after)} · ${after <= 0 ? "Paid" : "Partial"}`, [after]);

  async function save() {
    setError(null);
    if (cents <= 0) return setError("Enter an amount");
    setBusy(true);
    const res = await onSave({ method, amountCents: cents, paidOn, reference: reference.trim() || null });
    setBusy(false);
    if (res && "error" in res && res.error) return setError(res.error);
    onClose();
  }

  return (
    <div
      className="inv-sheetbg"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 95, display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 10 }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <Card style={{ width: "100%", maxWidth: 460, maxHeight: "calc(100vh - 20px)", overflow: "auto" }}>
        <div style={cap}>
          {invoice.customerName} · {invoice.number}
        </div>
        <b style={{ fontSize: 19 }}>Record a payment</b>
        <div style={{ fontSize: 13, color: t.muted, fontWeight: 600 }}>
          Balance {formatMoney(totals.balanceCents)}
          {invoice.depositCents > 0 && totals.paidCents < invoice.depositCents ? ` · deposit ${formatMoney(invoice.depositCents)} not paid yet` : ""}. Partial payments are
          fine.
        </div>
        <Field label="How they paid">
          <div style={{ display: "flex", border: `1px solid ${t.border}`, borderRadius: 100, overflow: "hidden", background: t.elev }}>
            {(["venmo", "check"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                style={{
                  flex: 1,
                  minHeight: 40,
                  border: 0,
                  background: method === m ? t.ink : "none",
                  color: method === m ? "#fff" : t.fg,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {m === "venmo" ? "Venmo" : "Check"}
              </button>
            ))}
          </div>
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Amount">
            <input style={inputStyle} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Paid on">
            <input style={inputStyle} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>
        <Field label={method === "check" ? "Check number" : "Venmo transaction ID"}>
          <input
            style={inputStyle}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === "check" ? "1042" : "e.g. 4100000007"}
          />
        </Field>
        <div style={{ fontSize: 13, color: t.muted, fontWeight: 600 }}>{afterLabel}</div>
        {cents > totals.balanceCents && (
          <div style={{ fontSize: 13, fontWeight: 700, color: t.error }}>This is more than the balance ({formatMoney(totals.balanceCents)}). You can still record it.</div>
        )}
        {error && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <div style={{ flex: 1 }}>
            <Btn kind="ink" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save payment"}
            </Btn>
          </div>
        </div>
      </Card>
    </div>
  );
}
