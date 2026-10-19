// Pure helpers for the New invoice form: pick Event, then a registered
// Program (or a free-text fallback), and fill name / email / fee from that.

import type { CreateInvoiceInput, EventCustomer } from "./types.ts";

export const OTHER_EVENT_ID = "__other__";
export const OTHER_PROGRAM_ID = "__other__";

export interface InvoiceEventOption {
  id: string;
  label: string;
  feeCents: number | null;
}

export function invoiceEventLabel(row: {
  shortName?: string | null;
  event?: string | null;
  startsOn?: string | null;
}): string {
  const short = row.shortName?.trim();
  const event = row.event?.trim();
  const base = short || event || "Tournament";
  const year = row.startsOn?.slice(0, 4);
  if (year && !base.includes(year)) return `${base} ${year}`;
  return base;
}

export function invoiceEventsFromRows(input: {
  plans: { weekend_id: string; hosted: boolean; short_name: string | null; team_fee_cents: number | null }[];
  weekends: { id: string; event: string | null; starts_on: string; status: string }[];
}): InvoiceEventOption[] {
  const weekById = new Map(input.weekends.map((w) => [w.id, w]));
  return input.plans
    .filter((p) => p.hosted)
    .map((p) => {
      const w = weekById.get(p.weekend_id);
      if (!w || w.status === "canceled" || w.status === "off") return null;
      return {
        id: p.weekend_id,
        label: invoiceEventLabel({ shortName: p.short_name, event: w.event, startsOn: w.starts_on }),
        feeCents: p.team_fee_cents == null ? null : Number(p.team_fee_cents),
        startsOn: w.starts_on,
      };
    })
    .filter((row): row is InvoiceEventOption & { startsOn: string } => !!row)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.label.localeCompare(b.label))
    .map((row) => ({ id: row.id, label: row.label, feeCents: row.feeCents }));
}

export function programOptionLabel(customer: EventCustomer): string {
  const teams = customer.teamCount === 1 ? "1 team" : `${customer.teamCount} teams`;
  return customer.divisions ? `${customer.name} · ${teams} · ${customer.divisions}` : `${customer.name} · ${teams}`;
}

export function autoLineDescription(eventLabel: string | null | undefined): string {
  const label = eventLabel?.trim();
  return label ? `Team fee · ${label}` : "Team fee";
}

export const PROGRAMS_LOAD_ERROR = "Couldn't load registered programs.";
export const PROGRAMS_LOAD_RELOAD = "Reload";
export const PROGRAMS_RELOAD_FIRST = "Reload first";

export type AutoFillFields = {
  customerName: string;
  customerEmail: string;
  qty: string;
  rate: string;
  desc: string;
};

export function emptyAutoFill(defaultFeeCents?: number, defaultEvent?: string): AutoFillFields {
  return {
    customerName: "",
    customerEmail: "",
    qty: "1",
    rate: defaultFeeCents ? String(defaultFeeCents / 100) : "",
    desc: autoLineDescription(defaultEvent),
  };
}

/** Refill only fields that still hold the last automatic value. User edits stay. */
export function keepAutoFill(
  current: AutoFillFields,
  lastAuto: AutoFillFields,
  nextAuto: AutoFillFields
): { fields: AutoFillFields; lastAuto: AutoFillFields } {
  const fields = { ...current };
  const auto = { ...lastAuto };
  for (const key of ["customerName", "customerEmail", "qty", "rate", "desc"] as const) {
    if (current[key] === lastAuto[key]) {
      fields[key] = nextAuto[key];
      auto[key] = nextAuto[key];
    }
  }
  return { fields, lastAuto: auto };
}

export function pickInvoiceProgram(
  state: { fields: AutoFillFields; lastAuto: AutoFillFields },
  program: EventCustomer | null,
  event: InvoiceEventOption | null
): { fields: AutoFillFields; lastAuto: AutoFillFields } {
  return keepAutoFill(state.fields, state.lastAuto, applyProgramSelection(program, event));
}

/** Changing Event clears the program pick and refills only unedited fields. */
export function pickInvoiceEvent(
  state: { fields: AutoFillFields; lastAuto: AutoFillFields },
  event: InvoiceEventOption | null
): { fields: AutoFillFields; lastAuto: AutoFillFields } {
  return pickInvoiceProgram(state, null, event);
}

export function shouldShowProgramsLoadError(input: {
  eventId: string;
  eventsError?: boolean;
  customersErrorByEvent?: Record<string, boolean>;
}): boolean {
  if (input.eventsError) return true;
  return !!input.eventId && !!input.customersErrorByEvent?.[input.eventId];
}

export function applyProgramSelection(
  program: EventCustomer | null,
  event: InvoiceEventOption | null
): {
  customerName: string;
  customerEmail: string;
  qty: string;
  rate: string;
  desc: string;
  hostCustomerId: string | null;
} {
  const label = event?.label ?? "";
  const fee = event?.feeCents;
  const rate = fee != null ? String(fee / 100) : "";
  const desc = autoLineDescription(label);
  if (!program) {
    return {
      customerName: "",
      customerEmail: "",
      qty: "1",
      rate,
      desc,
      hostCustomerId: null,
    };
  }
  return {
    customerName: program.name,
    customerEmail: program.emails.join(", "),
    qty: String(program.teamCount > 0 ? program.teamCount : 1),
    rate,
    desc,
    hostCustomerId: program.id,
  };
}

export function resolveCreateInvoiceInput(input: {
  eventId: string;
  events: InvoiceEventOption[];
  customEvent: string;
  programId: string;
  customers: EventCustomer[];
  customName: string;
  email: string;
  desc: string;
  qty: string;
  rate: string;
  due: string;
  dep: string;
  depDue: string;
  programsLoadFailed?: boolean;
}): { error: string } | { input: CreateInvoiceInput } {
  if (input.programsLoadFailed) return { error: PROGRAMS_RELOAD_FIRST };
  const hosted = input.events.find((e) => e.id === input.eventId) ?? null;
  const otherEvent = input.eventId === OTHER_EVENT_ID;
  if (!hosted && !otherEvent) return { error: "Pick an event." };
  const eventLabel = hosted ? hosted.label : input.customEvent.trim();
  if (otherEvent && !eventLabel) return { error: "Enter the event name." };

  const registered = !otherEvent && input.programId && input.programId !== OTHER_PROGRAM_ID
    ? (input.customers.find((c) => c.id === input.programId) ?? null)
    : null;
  if (!otherEvent && !input.programId) return { error: "Pick a program." };

  const name = (registered?.name ?? input.customName).trim();
  if (!name) return { error: "Enter the program name." };
  if (!input.due) return { error: "Pick a balance due date." };

  const q = parseInt(input.qty, 10) || 0;
  const unit = Math.round((parseFloat(input.rate.replace(/[$,]/g, "")) || 0) * 100);
  return {
    input: {
      hostEventId: hosted?.id ?? null,
      hostCustomerId: registered?.id ?? null,
      customerName: name,
      customerEmail: input.email.trim() || null,
      eventLabel: eventLabel || null,
      dueOn: input.due,
      depositCents: Math.round((parseFloat(input.dep.replace(/[$,]/g, "")) || 0) * 100),
      depositDueOn: input.depDue || null,
      lines: [{ description: input.desc.trim() || autoLineDescription(eventLabel), qty: q, unitCents: unit }],
    },
  };
}
