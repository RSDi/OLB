import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampDeposit,
  computeInvoice,
  effectiveMailCopies,
  effectiveReminders,
  eventCollection,
  invoiceStatus,
  parseEmailList,
  payNowCents,
  shouldSendReminder,
  teamFeesCollected,
  formatMoney,
} from "../src/logic.ts";
import type { Invoice, LineItem, Payment } from "../src/types.ts";

function inv(extra: Partial<Invoice> & { lines: LineItem[]; payments?: Payment[] }): Invoice {
  return {
    id: extra.id ?? "i1",
    number: extra.number ?? "INV-2026-0001",
    hostEventId: extra.hostEventId ?? "evt",
    hostCustomerId: extra.hostCustomerId ?? "pg1",
    customerName: extra.customerName ?? "Prairie Hoops",
    customerEmail: extra.customerEmail ?? "a@example.com",
    eventLabel: extra.eventLabel ?? "MRS 2026",
    issuedOn: extra.issuedOn ?? "2026-10-05",
    dueOn: extra.dueOn ?? "2026-11-01",
    depositCents: extra.depositCents ?? 0,
    depositDueOn: extra.depositDueOn ?? null,
    sentAt: extra.sentAt !== undefined ? extra.sentAt : "2026-10-05T12:00:00Z",
    viewedAt: extra.viewedAt ?? null,
    voidedAt: extra.voidedAt ?? null,
    publicToken: extra.publicToken ?? "tok",
    createdBy: null,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    ccEmails: extra.ccEmails ?? null,
    bccEmails: extra.bccEmails ?? null,
    reminderFreq: extra.reminderFreq ?? null,
    reminderStartDays: extra.reminderStartDays ?? null,
    reminderUntilPaid: extra.reminderUntilPaid ?? null,
    lines: extra.lines,
    payments: extra.payments ?? [],
  };
}

const fee = (qty: number, unit = 31500): LineItem => ({
  id: "l",
  description: "Team fee · MRS 2026",
  qty,
  unitCents: unit,
  sortOrder: 0,
});

const pay = (cents: number, extra: Partial<Payment> = {}): Payment => ({
  id: extra.id ?? "p",
  method: extra.method ?? "venmo",
  amountCents: cents,
  paidOn: extra.paidOn ?? "2026-10-10",
  reference: extra.reference ?? null,
  recordedBy: extra.recordedBy ?? null,
  createdAt: extra.createdAt ?? "2026-10-10T12:00:00Z",
});

test("status: draft, sent, viewed, partial, paid, overdue, void, $0 sent is paid", () => {
  const today = "2026-10-19";
  const lines = [fee(2)];
  assert.equal(invoiceStatus(inv({ sentAt: null, lines }), today), "Draft");
  assert.equal(invoiceStatus(inv({ lines, viewedAt: null }), today), "Sent");
  assert.equal(invoiceStatus(inv({ lines, viewedAt: "2026-10-07T00:00:00Z" }), today), "Viewed");
  assert.equal(invoiceStatus(inv({ lines, payments: [pay(20000)], depositCents: 20000, depositDueOn: "2026-10-15" }), today), "Partial");
  assert.equal(invoiceStatus(inv({ lines, payments: [pay(63000)] }), today), "Paid");
  assert.equal(invoiceStatus(inv({ lines, dueOn: "2026-10-01" }), today), "Overdue");
  assert.equal(invoiceStatus(inv({ lines, voidedAt: "2026-10-06T00:00:00Z" }), today), "Void");
  assert.equal(invoiceStatus(inv({ lines: [fee(0)], payments: [] }), today), "Paid");
});

test("deposit and balance are tracked separately; pay-now is remaining deposit first", () => {
  const v = inv({
    lines: [fee(2)],
    depositCents: 20000,
    depositDueOn: "2026-10-15",
    payments: [pay(20000)],
  });
  const tot = computeInvoice(v, "2026-10-19");
  assert.equal(tot.totalCents, 63000);
  assert.equal(tot.paidCents, 20000);
  assert.equal(tot.balanceCents, 43000);
  assert.equal(tot.depositPaid, true);
  assert.equal(tot.payNowCents, 43000);
  assert.equal(payNowCents(inv({ lines: [fee(2)], depositCents: 20000, payments: [] })), 20000);
});

test("clampDeposit never exceeds the invoice total", () => {
  assert.equal(clampDeposit(80000, 63000), 63000);
  assert.equal(clampDeposit(-10, 100), 0);
  assert.equal(clampDeposit(50, 100), 50);
});

test("team fees collected uses eventCollection: expected programs, $0, void, overpay cap for tick", () => {
  const a = inv({ id: "a", lines: [fee(2)], payments: [pay(63000)] });
  const b = inv({ id: "b", lines: [fee(3)], payments: [pay(30000)] });
  const c = inv({ id: "c", lines: [fee(1)], payments: [] });
  const partial = teamFeesCollected([a, b, c], 3);
  assert.equal(partial.done, false);
  const all = teamFeesCollected(
    [a, inv({ id: "b", lines: [fee(3)], payments: [pay(94500)] }), inv({ id: "c", lines: [fee(1)], payments: [pay(31500)] })],
    3
  );
  assert.equal(all.done, true);
  assert.equal(all.collectedCents, all.billedCents);
});

test("allCollected is false when fewer invoices than expected programs", () => {
  const sent = [
    inv({ id: "1", lines: [fee(1)], sentAt: "2026-10-05T00:00:00Z", payments: [pay(31500)] }),
    inv({ id: "2", lines: [fee(1)], sentAt: "2026-10-05T00:00:00Z", payments: [pay(31500)] }),
  ];
  const eight = eventCollection("evt", sent, 8);
  assert.equal(eight.allSent, false);
  assert.equal(eight.allCollected, false);
  assert.equal(eight.sentCount, 2);
  const two = eventCollection("evt", sent, 2);
  assert.equal(two.allSent, true);
  assert.equal(two.allCollected, true);
});

test("drafts do not count as billed; $0 sent invoices count as collected; voided drop out of n and x", () => {
  const draft = inv({ id: "d", sentAt: null, lines: [fee(1)], payments: [] });
  const zero = inv({ id: "z", lines: [fee(0)], payments: [] });
  const voided = inv({ id: "v", lines: [fee(1)], payments: [pay(31500)], voidedAt: "2026-10-06T00:00:00Z" });
  const paid = inv({ id: "p", lines: [fee(1)], payments: [pay(31500)] });
  const mix = eventCollection("evt", [draft, zero, voided, paid], 2);
  assert.equal(mix.invoiceCount, 3);
  assert.equal(mix.sentCount, 2);
  assert.equal(mix.billedCents, 31500);
  assert.equal(mix.paidCount, 2);
  assert.equal(mix.allCollected, true);
});

test("overpayment displays the real amount but ticking caps at 100%", () => {
  const over = inv({ id: "o", lines: [fee(1)], payments: [pay(40000)] });
  const sum = eventCollection("evt", [over], 1);
  assert.equal(sum.collectedCents, 40000);
  assert.equal(sum.billedCents, 31500);
  assert.equal(sum.allCollected, true);
});

test("Deposits x of N only counts invoices that have a deposit", () => {
  const withDep = inv({ id: "a", lines: [fee(1)], depositCents: 10000, payments: [pay(10000)] });
  const noDep = inv({ id: "b", lines: [fee(1)], depositCents: 0, payments: [] });
  const sum = eventCollection("evt", [withDep, noDep], 2);
  assert.equal(sum.depositInvoiceCount, 1);
  assert.equal(sum.depositPaidCount, 1);
});

test("per-invoice reminder override wins over the club default", () => {
  const club = { freq: "weekly" as const, startDays: 7, untilPaid: true };
  const invoice = inv({ lines: [fee(1)], reminderFreq: "off" });
  assert.equal(effectiveReminders(invoice, club).freq, "off");
  assert.equal(effectiveReminders(inv({ lines: [fee(1)] }), club).freq, "weekly");
});

test("mail copies: invoice override (including empty) over club default", () => {
  const club = { ccEmails: ["club@example.com"], bccEmails: ["bcc@example.com"] };
  assert.deepEqual(effectiveMailCopies(inv({ lines: [fee(1)], ccEmails: null, bccEmails: null }), club), {
    cc: ["club@example.com"],
    bcc: ["bcc@example.com"],
  });
  assert.deepEqual(effectiveMailCopies(inv({ lines: [fee(1)], ccEmails: [], bccEmails: ["other@example.com"] }), club), {
    cc: [],
    bcc: ["other@example.com"],
  });
});

test("parseEmailList validates and de-dupes; empty is ok", () => {
  assert.deepEqual(parseEmailList(""), { ok: true, data: [] });
  assert.equal(parseEmailList("not-an-email").ok, false);
  const ok = parseEmailList("A@x.com, a@x.com; b@x.com");
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.data, ["A@x.com", "b@x.com"]);
});

test("reminders fire for unpaid invoices that are past due or coming due", () => {
  const settings = { freq: "3d" as const, startDays: 7, untilPaid: true };
  const coming = inv({ lines: [fee(1)], dueOn: "2026-10-26", depositCents: 0 });
  assert.equal(shouldSendReminder({ invoice: coming, settings, today: "2026-10-19", priorSendDates: [] }), true);
  assert.equal(shouldSendReminder({ invoice: coming, settings, today: "2026-10-10", priorSendDates: [] }), false);
  const paid = inv({ lines: [fee(1)], payments: [pay(31500)] });
  assert.equal(shouldSendReminder({ invoice: paid, settings, today: "2026-10-19", priorSendDates: [] }), false);
  const interval = inv({ lines: [fee(1)], dueOn: "2026-10-01" });
  assert.equal(shouldSendReminder({ invoice: interval, settings, today: "2026-10-19", priorSendDates: ["2026-10-18"] }), false);
  assert.equal(shouldSendReminder({ invoice: interval, settings, today: "2026-10-21", priorSendDates: ["2026-10-18"] }), true);
  assert.equal(
    shouldSendReminder({ invoice: interval, settings: { ...settings, untilPaid: false }, today: "2026-10-21", priorSendDates: ["2026-10-01", "2026-10-04", "2026-10-07"] }),
    false
  );
  assert.equal(shouldSendReminder({ invoice: inv({ lines: [fee(1)], voidedAt: "2026-10-06T00:00:00Z" }), settings, today: "2026-10-19", priorSendDates: [] }), false);
});

test("formatMoney drops cents on whole dollars", () => {
  assert.equal(formatMoney(301500), "$3,015");
  assert.equal(formatMoney(31500), "$315");
  assert.equal(formatMoney(199), "$1.99");
});
