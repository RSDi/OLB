"use client";

import { useState } from "react";
import {
  OTHER_EVENT_ID,
  OTHER_PROGRAM_ID,
  PROGRAMS_LOAD_ERROR,
  PROGRAMS_LOAD_RELOAD,
  applyProgramSelection,
  autoLineDescription,
  emptyAutoFill,
  keepAutoFill,
  programOptionLabel,
  resolveCreateInvoiceInput,
  shouldShowProgramsLoadError,
  type AutoFillFields,
  type InvoiceEventOption,
} from "../new-invoice";
import type { CreateInvoiceInput, EventCustomer } from "../types";
import { Btn, Card, Field, inputStyle } from "./parts";
import { t } from "./theme";

export function NewInvoiceForm({
  today,
  events = [],
  customersByEvent = {},
  customersErrorByEvent = {},
  eventsError = false,
  defaultEvent,
  defaultFeeCents,
  backHref,
  onCreate,
}: {
  today: string;
  events?: InvoiceEventOption[];
  customersByEvent?: Record<string, EventCustomer[]>;
  customersErrorByEvent?: Record<string, boolean>;
  eventsError?: boolean;
  defaultEvent?: string;
  defaultFeeCents?: number;
  backHref: string;
  onCreate: (input: CreateInvoiceInput) => Promise<{ error?: string } | void>;
}) {
  const initialEventId = matchEventId(events, defaultEvent);
  const initial = emptyAutoFill(defaultFeeCents, defaultEvent);
  const [eventId, setEventId] = useState(initialEventId);
  const [customEvent, setCustomEvent] = useState(initialEventId === OTHER_EVENT_ID ? (defaultEvent ?? "") : "");
  const [programId, setProgramId] = useState("");
  const [name, setName] = useState(initial.customerName);
  const [email, setEmail] = useState(initial.customerEmail);
  const [qty, setQty] = useState(initial.qty);
  const [rate, setRate] = useState(initial.rate);
  const [desc, setDesc] = useState(initial.desc);
  const [lastAuto, setLastAuto] = useState<AutoFillFields>(initial);
  const [due, setDue] = useState("");
  const [dep, setDep] = useState("");
  const [depDue, setDepDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hosted = events.find((e) => e.id === eventId) ?? null;
  const otherEvent = eventId === OTHER_EVENT_ID;
  const otherProgram = programId === OTHER_PROGRAM_ID;
  const customers = hosted ? (customersByEvent[hosted.id] ?? []) : [];
  const showProgramSelect = !!hosted;
  const showProgramName = otherEvent || otherProgram;
  const programsError = shouldShowProgramsLoadError({
    eventId,
    eventsError,
    customersErrorByEvent,
  });

  function currentFields(): AutoFillFields {
    return { customerName: name, customerEmail: email, qty, rate, desc };
  }

  function applyFilled(next: { fields: AutoFillFields; lastAuto: AutoFillFields }) {
    setName(next.fields.customerName);
    setEmail(next.fields.customerEmail);
    setQty(next.fields.qty);
    setRate(next.fields.rate);
    setDesc(next.fields.desc);
    setLastAuto(next.lastAuto);
  }

  function applyEvent(nextId: string) {
    setEventId(nextId);
    setProgramId("");
    setCustomEvent("");
    const next = events.find((e) => e.id === nextId) ?? null;
    applyFilled(keepAutoFill(currentFields(), lastAuto, applyProgramSelection(null, next)));
  }

  function applyProgram(nextId: string) {
    setProgramId(nextId);
    const program = nextId && nextId !== OTHER_PROGRAM_ID ? (customers.find((c) => c.id === nextId) ?? null) : null;
    applyFilled(keepAutoFill(currentFields(), lastAuto, applyProgramSelection(program, hosted)));
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
            <select style={inputStyle} value={programId} onChange={(e) => applyProgram(e.target.value)}>
              <option value="">Select a program</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {programOptionLabel(c)}
                </option>
              ))}
              <option value={OTHER_PROGRAM_ID}>Other program (not registered)</option>
            </select>
          </Field>
        )}
        {programsError && <ProgramsLoadNotice />}
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

function ProgramsLoadNotice() {
  return (
    <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>
      {PROGRAMS_LOAD_ERROR}{" "}
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          fontWeight: 800,
          color: t.ink,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {PROGRAMS_LOAD_RELOAD}
      </button>
    </div>
  );
}

function matchEventId(events: InvoiceEventOption[], defaultEvent?: string): string {
  if (!defaultEvent) return "";
  const hit = events.find((e) => e.id === defaultEvent || e.label === defaultEvent);
  return hit?.id ?? OTHER_EVENT_ID;
}
