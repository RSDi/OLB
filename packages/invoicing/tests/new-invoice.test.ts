import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OTHER_EVENT_ID,
  OTHER_PROGRAM_ID,
  PROGRAMS_LOAD_ERROR,
  PROGRAMS_LOAD_RELOAD,
  applyProgramSelection,
  autoLineDescription,
  emptyAutoFill,
  invoiceEventLabel,
  invoiceEventsFromRows,
  pickInvoiceProgram,
  programOptionLabel,
  resolveCreateInvoiceInput,
  shouldShowProgramsLoadError,
} from "../src/new-invoice.ts";
import type { EventCustomer, InvoiceEventOption } from "../src/index.ts";

const mrs: InvoiceEventOption = { id: "wk-1", label: "MRS 2026", feeCents: 31500 };
const prairie: EventCustomer = {
  id: "c1",
  name: "Prairie Hoops",
  emails: ["a@example.com", "b@example.com"],
  teamCount: 2,
  divisions: "HSA",
};
const metro: EventCustomer = {
  id: "c2",
  name: "Metro",
  emails: ["metro@example.com"],
  teamCount: 1,
};

test("invoiceEventsFromRows lists hosted weekends newest first and skips canceled", () => {
  const events = invoiceEventsFromRows({
    plans: [
      { weekend_id: "old", hosted: true, short_name: "MRS", team_fee_cents: 30000 },
      { weekend_id: "new", hosted: true, short_name: "MRS", team_fee_cents: 31500 },
      { weekend_id: "off", hosted: true, short_name: "Scrimmage", team_fee_cents: 0 },
      { weekend_id: "hidden", hosted: false, short_name: "Hidden", team_fee_cents: 1 },
    ],
    weekends: [
      { id: "old", event: "Missouri River Shootout", starts_on: "2025-11-14", status: "secured" },
      { id: "new", event: "Missouri River Shootout", starts_on: "2026-11-13", status: "planned" },
      { id: "off", event: "Canceled", starts_on: "2026-12-01", status: "canceled" },
      { id: "hidden", event: "Not hosted", starts_on: "2026-10-01", status: "planned" },
    ],
  });
  assert.deepEqual(
    events.map((e) => ({ id: e.id, label: e.label, feeCents: e.feeCents })),
    [
      { id: "new", label: "MRS 2026", feeCents: 31500 },
      { id: "old", label: "MRS 2025", feeCents: 30000 },
    ]
  );
});

test("invoiceEventLabel prefers short name and adds the year once", () => {
  assert.equal(invoiceEventLabel({ shortName: "MRS", event: "Missouri River Shootout", startsOn: "2026-11-13" }), "MRS 2026");
  assert.equal(invoiceEventLabel({ shortName: "MRS 2026", event: "Missouri River Shootout", startsOn: "2026-11-13" }), "MRS 2026");
  assert.equal(invoiceEventLabel({ shortName: null, event: "Gym share", startsOn: null }), "Gym share");
  assert.equal(invoiceEventLabel({}), "Tournament");
});

test("applyProgramSelection fills name, emails, team count and the event fee", () => {
  const filled = applyProgramSelection(prairie, mrs);
  assert.equal(filled.customerName, "Prairie Hoops");
  assert.equal(filled.customerEmail, "a@example.com, b@example.com");
  assert.equal(filled.qty, "2");
  assert.equal(filled.rate, "315");
  assert.equal(filled.desc, "Team fee · MRS 2026");
  assert.equal(filled.hostCustomerId, "c1");
});

test("editing the program email and picking again keeps the edit", () => {
  let state = { fields: emptyAutoFill(), lastAuto: emptyAutoFill() };
  state = pickInvoiceProgram(state, prairie, mrs);
  assert.equal(state.fields.customerEmail, "a@example.com, b@example.com");
  assert.equal(state.fields.qty, "2");
  state = { ...state, fields: { ...state.fields, customerEmail: "jeff@example.com" } };
  state = pickInvoiceProgram(state, metro, mrs);
  assert.equal(state.fields.customerEmail, "jeff@example.com");
  assert.equal(state.fields.customerName, "Metro");
  assert.equal(state.fields.qty, "1");
  state = pickInvoiceProgram(state, null, mrs);
  assert.equal(state.fields.customerEmail, "jeff@example.com");
  assert.equal(state.fields.customerName, "");
});

test("unedited auto-filled fields still update when the pick changes", () => {
  let state = { fields: emptyAutoFill(), lastAuto: emptyAutoFill() };
  state = pickInvoiceProgram(state, prairie, mrs);
  state = pickInvoiceProgram(state, metro, mrs);
  assert.equal(state.fields.customerEmail, "metro@example.com");
  assert.equal(state.fields.qty, "1");
  assert.equal(state.fields.desc, "Team fee · MRS 2026");
});

test("a failed program load is shown, not treated as nobody registered", () => {
  assert.equal(shouldShowProgramsLoadError({ eventId: "wk-1", customersErrorByEvent: { "wk-1": true } }), true);
  assert.equal(shouldShowProgramsLoadError({ eventId: "wk-1", customersErrorByEvent: {} }), false);
  assert.equal(shouldShowProgramsLoadError({ eventId: "", eventsError: true }), true);
  const form = readFileSync(join(import.meta.dirname, "../src/ui/NewInvoiceForm.tsx"), "utf8");
  assert.match(form, /PROGRAMS_LOAD_ERROR/);
  assert.match(form, /PROGRAMS_LOAD_RELOAD/);
  assert.match(form, /shouldShowProgramsLoadError/);
  assert.equal(`${PROGRAMS_LOAD_ERROR} ${PROGRAMS_LOAD_RELOAD}`, "Couldn't load registered programs. Reload");
});

test("applyProgramSelection leaves a free-text fallback blank except fee and line", () => {
  const filled = applyProgramSelection(null, mrs);
  assert.equal(filled.customerName, "");
  assert.equal(filled.customerEmail, "");
  assert.equal(filled.qty, "1");
  assert.equal(filled.rate, "315");
  assert.equal(filled.hostCustomerId, null);
  assert.equal(autoLineDescription(""), "Team fee");
  assert.equal(programOptionLabel(prairie), "Prairie Hoops · 2 teams · HSA");
});

test("resolveCreateInvoiceInput keeps host ids for a registered program", () => {
  const res = resolveCreateInvoiceInput({
    eventId: mrs.id,
    events: [mrs],
    customEvent: "",
    programId: prairie.id,
    customers: [prairie],
    customName: "ignored",
    email: "override@example.com",
    desc: "Team fee · MRS 2026",
    qty: "2",
    rate: "315",
    due: "2026-11-01",
    dep: "",
    depDue: "",
  });
  assert.ok("input" in res);
  assert.equal(res.input.hostEventId, "wk-1");
  assert.equal(res.input.hostCustomerId, "c1");
  assert.equal(res.input.customerName, "Prairie Hoops");
  assert.equal(res.input.customerEmail, "override@example.com");
  assert.equal(res.input.eventLabel, "MRS 2026");
  assert.deepEqual(res.input.lines, [{ description: "Team fee · MRS 2026", qty: 2, unitCents: 31500 }]);
});

test("resolveCreateInvoiceInput allows Other program without a host customer id", () => {
  const res = resolveCreateInvoiceInput({
    eventId: mrs.id,
    events: [mrs],
    customEvent: "",
    programId: OTHER_PROGRAM_ID,
    customers: [prairie],
    customName: "Walk-on Academy",
    email: "walk@example.com",
    desc: "Team fee · MRS 2026",
    qty: "1",
    rate: "315",
    due: "2026-11-01",
    dep: "50",
    depDue: "2026-10-20",
  });
  assert.ok("input" in res);
  assert.equal(res.input.hostEventId, "wk-1");
  assert.equal(res.input.hostCustomerId, null);
  assert.equal(res.input.customerName, "Walk-on Academy");
  assert.equal(res.input.depositCents, 5000);
  assert.equal(res.input.depositDueOn, "2026-10-20");
});

test("resolveCreateInvoiceInput allows Other event as free text", () => {
  const res = resolveCreateInvoiceInput({
    eventId: OTHER_EVENT_ID,
    events: [mrs],
    customEvent: "Gym share",
    programId: "",
    customers: [],
    customName: "West Gym",
    email: "",
    desc: "Court rental",
    qty: "1",
    rate: "100",
    due: "2026-12-01",
    dep: "",
    depDue: "",
  });
  assert.ok("input" in res);
  assert.equal(res.input.hostEventId, null);
  assert.equal(res.input.hostCustomerId, null);
  assert.equal(res.input.eventLabel, "Gym share");
  assert.equal(res.input.customerName, "West Gym");
});

test("resolveCreateInvoiceInput asks for event, program, name and due date", () => {
  assert.deepEqual(
    resolveCreateInvoiceInput({
      eventId: "",
      events: [mrs],
      customEvent: "",
      programId: "",
      customers: [],
      customName: "",
      email: "",
      desc: "",
      qty: "1",
      rate: "",
      due: "",
      dep: "",
      depDue: "",
    }),
    { error: "Pick an event." }
  );
  assert.equal(
    (
      resolveCreateInvoiceInput({
        eventId: mrs.id,
        events: [mrs],
        customEvent: "",
        programId: "",
        customers: [prairie],
        customName: "",
        email: "",
        desc: "",
        qty: "1",
        rate: "",
        due: "2026-11-01",
        dep: "",
        depDue: "",
      }) as { error: string }
    ).error,
    "Pick a program."
  );
  assert.equal(
    (
      resolveCreateInvoiceInput({
        eventId: OTHER_EVENT_ID,
        events: [mrs],
        customEvent: "",
        programId: "",
        customers: [],
        customName: "West",
        email: "",
        desc: "",
        qty: "1",
        rate: "",
        due: "2026-11-01",
        dep: "",
        depDue: "",
      }) as { error: string }
    ).error,
    "Enter the event name."
  );
});

test("New invoice form picks Event, then registered Program, with a free-text fallback", () => {
  const form = readFileSync(join(import.meta.dirname, "../src/ui/NewInvoiceForm.tsx"), "utf8");
  assert.match(form, /label="Event"/);
  assert.match(form, /Other event/);
  assert.match(form, /label="Program"/);
  assert.match(form, /Other program \(not registered\)/);
  assert.match(form, /label="Program name"/);
  assert.match(form, /label="Program email"/);
  assert.match(form, /customersByEvent/);
  assert.match(form, /resolveCreateInvoiceInput/);
  const eventAt = form.indexOf('label="Event"');
  const programAt = form.indexOf('label="Program"');
  const emailAt = form.indexOf('label="Program email"');
  assert.ok(eventAt > 0 && eventAt < programAt && programAt < emailAt);
});
