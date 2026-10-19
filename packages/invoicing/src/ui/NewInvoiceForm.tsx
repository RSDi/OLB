"use client";

import { useEffect, useState } from "react";
import {
  OTHER_EVENT_ID,
  OTHER_PROGRAM_ID,
  applyProgramSelection,
  autoLineDescription,
  programOptionLabel,
  resolveCreateInvoiceInput,
  type InvoiceEventOption,
} from "../new-invoice";
import type { CreateInvoiceInput, EventCustomer } from "../types";
import { Btn, Card, Field, inputStyle } from "./parts";
import { t } from "./theme";

export function NewInvoiceForm({
  today,
  events = [],
  defaultEvent,
  defaultFeeCents,
  backHref,
  loadCustomers,
  onCreate,
}: {
  today: string;
  events?: InvoiceEventOption[];
  defaultEvent?: string;
  defaultFeeCents?: number;
  backHref: string;
  loadCustomers?: (eventId: string) => Promise<{ customers?: EventCustomer[]; error?: string }>;
  onCreate: (input: CreateInvoiceInput) => Promise<{ error?: string } | void>;
}) {
  const initialEventId = matchEventId(events, defaultEvent);
  const [eventId, setEventId] = useState(initialEventId);
  const [customEvent, setCustomEvent] = useState(initialEventId === OTHER_EVENT_ID ? (defaultEvent ?? "") : "");
  const [programId, setProgramId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState(defaultFeeCents ? String(defaultFeeCents / 100) : "");
  const [desc, setDesc] = useState(autoLineDescription(defaultEvent));
  const [due, setDue] = useState("");
  const [dep, setDep] = useState("");
  const [depDue, setDepDue] = useState("");
  const [customers, setCustomers] = useState<EventCustomer[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hosted = events.find((e) => e.id === eventId) ?? null;
  const otherEvent = eventId === OTHER_EVENT_ID;
  const otherProgram = programId === OTHER_PROGRAM_ID;
  const showProgramSelect = !!hosted;
  const showProgramName = otherEvent || otherProgram;

  useEffect(() => {
    if (!hosted || !loadCustomers) {
      setCustomers([]);
      setProgramsError(null);
      setLoadingPrograms(false);
      return;
    }
    let cancelled = false;
    setLoadingPrograms(true);
    setProgramsError(null);
    loadCustomers(hosted.id).then((res) => {
      if (cancelled) return;
      setLoadingPrograms(false);
      if (res.error) {
        setCustomers([]);
        setProgramsError(res.error);
        return;
      }
      setCustomers(res.customers ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [hosted?.id, loadCustomers]);

  function applyEvent(nextId: string) {
    setEventId(nextId);
    setProgramId("");
    setCustomEvent("");
    const next = events.find((e) => e.id === nextId) ?? null;
    const filled = applyProgramSelection(null, next);
    setName(filled.customerName);
    setEmail(filled.customerEmail);
    setQty(filled.qty);
    setRate(filled.rate || (defaultFeeCents ? String(defaultFeeCents / 100) : ""));
    setDesc(filled.desc);
    setCustomers([]);
    setProgramsError(null);
  }

  function applyProgram(nextId: string) {
    setProgramId(nextId);
    const program = nextId && nextId !== OTHER_PROGRAM_ID ? (customers.find((c) => c.id === nextId) ?? null) : null;
    const filled = applyProgramSelection(program, hosted);
    setName(program ? filled.customerName : "");
    setEmail(filled.customerEmail);
    setQty(filled.qty);
    if (filled.rate) setRate(filled.rate);
    setDesc(filled.desc);
  }

  async function save() {
    setError(null);
    const resolved = resolveCreateInvoiceInput({
      eventId,
      events,
      customEvent,
      programId,
      customers,
      customName: name,
      email,
      desc,
      qty,
      rate,
      due,
      dep,
      depDue,
    });
    if ("error" in resolved) return setError(resolved.error);
    setBusy(true);
    const res = await onCreate(resolved.input);
    setBusy(false);
    if (res && res.error) setError(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
      <Btn sm href={backHref}>
        ‹ Invoices
      </Btn>
      <h1 style={{ fontSize: 22, margin: 0 }}>New invoice</h1>
      <div style={{ color: t.muted, fontSize: 13 }}>
        Pick the event, then the program. Paid by Venmo or check. You can send it after you save.
      </div>
      <Card>
        <Field label="Event">
          <select style={inputStyle} value={eventId} onChange={(e) => applyEvent(e.target.value)}>
            <option value="">Select an event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
            <option value={OTHER_EVENT_ID}>Other event</option>
          </select>
        </Field>
        {otherEvent && (
          <Field label="Event name">
            <input
              style={inputStyle}
              value={customEvent}
              onChange={(e) => {
                const v = e.target.value;
                setCustomEvent(v);
                if (!desc || desc === autoLineDescription(customEvent)) setDesc(autoLineDescription(v));
              }}
              placeholder="MRS 2026"
            />
          </Field>
        )}
        {showProgramSelect && (
          <Field label="Program">
            <select
              style={inputStyle}
              value={programId}
              onChange={(e) => applyProgram(e.target.value)}
              disabled={loadingPrograms}
            >
              <option value="">{loadingPrograms ? "Loading programs…" : "Select a program"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {programOptionLabel(c)}
                </option>
              ))}
              <option value={OTHER_PROGRAM_ID}>Other program (not registered)</option>
            </select>
          </Field>
        )}
        {programsError && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{programsError}</div>}
        {showProgramName && (
          <Field label="Program name">
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name" />
          </Field>
        )}
        <Field label="Program email">
          <input
            style={inputStyle}
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="program email"
            disabled={!otherEvent && !programId}
          />
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

function matchEventId(events: InvoiceEventOption[], defaultEvent?: string): string {
  if (!defaultEvent) return "";
  const hit = events.find((e) => e.id === defaultEvent || e.label === defaultEvent);
  return hit?.id ?? OTHER_EVENT_ID;
}
