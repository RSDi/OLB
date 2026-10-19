"use client";

import { useState } from "react";
import type { CreateInvoiceInput } from "../types";
import { Btn, Card, Field, inputStyle } from "./parts";
import { t } from "./theme";

export function NewInvoiceForm({
  today,
  defaultEvent,
  defaultFeeCents,
  backHref,
  onCreate,
}: {
  today: string;
  defaultEvent?: string;
  defaultFeeCents?: number;
  backHref: string;
  onCreate: (input: CreateInvoiceInput) => Promise<{ error?: string } | void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [event, setEvent] = useState(defaultEvent ?? "");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState(defaultFeeCents ? String(defaultFeeCents / 100) : "");
  const [desc, setDesc] = useState(defaultEvent ? `Team fee · ${defaultEvent}` : "Team fee");
  const [due, setDue] = useState("");
  const [dep, setDep] = useState("");
  const [depDue, setDepDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const q = parseInt(qty, 10) || 0;
    const unit = Math.round((parseFloat(rate.replace(/[$,]/g, "")) || 0) * 100);
    if (!name.trim()) return setError("Enter the program name.");
    if (!due) return setError("Pick a balance due date.");
    setBusy(true);
    const res = await onCreate({
      customerName: name.trim(),
      customerEmail: email.trim() || null,
      eventLabel: event.trim() || null,
      dueOn: due,
      depositCents: Math.round((parseFloat(dep.replace(/[$,]/g, "")) || 0) * 100),
      depositDueOn: depDue || null,
      lines: [{ description: desc.trim() || "Team fee", qty: q, unitCents: unit }],
    });
    setBusy(false);
    if (res && res.error) setError(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <Btn sm href={backHref}>
        ‹ Invoices
      </Btn>
      <h1 style={{ fontSize: 22, margin: 0 }}>New invoice</h1>
      <div style={{ color: t.muted, fontSize: 13 }}>One program, paid by Venmo or check. You can send it after you save.</div>
      <Card>
        <Field label="Program">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name" />
        </Field>
        <Field label="Program email">
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="treasurer@example.com" />
        </Field>
        <Field label="Event">
          <input style={inputStyle} value={event} onChange={(e) => setEvent(e.target.value)} placeholder="MRS 2026" />
        </Field>
        <Field label="Line item">
          <input style={inputStyle} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Qty">
            <input style={inputStyle} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Rate">
            <input style={inputStyle} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="315" />
          </Field>
          <Field label="Deposit (optional)">
            <input style={inputStyle} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value)} />
          </Field>
          <Field label="Deposit due">
            <input style={inputStyle} type="date" value={depDue} onChange={(e) => setDepDue(e.target.value)} />
          </Field>
          <Field label="Balance due">
            <input style={inputStyle} type="date" value={due} onChange={(e) => setDue(e.target.value)} min={today} />
          </Field>
        </div>
        {error && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{error}</div>}
        <Btn kind="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save draft"}
        </Btn>
      </Card>
    </div>
  );
}
