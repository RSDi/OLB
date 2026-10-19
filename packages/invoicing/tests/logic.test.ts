import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoice,
  eventCollection,
  invoiceStatus,
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
    sentAt: extra.sentAt ?? "2026-10-05T12:00:00Z",
    viewedAt: extra.viewedAt ?? null,
    publicToken: extra.publicToken ?? "tok",
    createdBy: null,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
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

test("status: draft, sent, viewed, partial, paid, overdue", () => {
  const today = "2026-10-19";
  const lines = [fee(2)];
  assert.equal(invoiceStatus(inv({ sentAt: null, lines }), today), "Draft");
  assert.equal(invoiceStatus(inv({ lines, viewedAt: null }), today), "Sent");
  assert.equal(invoiceStatus(inv({ lines, viewedAt: "2026-10-07T00:00:00Z" }), today), "Viewed");
  assert.equal(invoiceStatus(inv({ lines, payments: [pay(20000)], depositCents: 20000, depositDueOn: "2026-10-15" }), today), "Partial");
  assert.equal(invoiceStatus(inv({ lines, payments: [pay(63000)] }), today), "Paid");
  assert.equal(invoiceStatus(inv({ lines, dueOn: "2026-10-01" }), today), "Overdue");
  assert.equal(
    invoiceStatus(inv({ lines, depositCents: 20000, depositDueOn: "2026-10-15", dueOn: "2026-11-01" }), today),
    "Overdue"
  );
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

test("team fees collected is n of x: collected vs billed for the event", () => {
  const a = inv({ id: "a", lines: [fee(2)], payments: [pay(63000)] });
  const b = inv({ id: "b", lines: [fee(3)], payments: [pay(30000)] });
  const c = inv({ id: "c", lines: [fee(1)], payments: [] });
  const partial = teamFeesCollected([a, b, c]);
  assert.equal(partial.billedCents, 63000 + 94500 + 31500);
  assert.equal(partial.collectedCents, 63000 + 30000);
  assert.equal(partial.done, false);
  const all = teamFeesCollected([
    a,
    inv({ id: "b", lines: [fee(3)], payments: [pay(94500)] }),
    inv({ id: "c", lines: [fee(1)], payments: [pay(31500)] }),
  ]);
  assert.equal(all.done, true);
  assert.equal(all.collectedCents, all.billedCents);
  assert.equal(all.nOfX, `${all.collectedCents} of ${all.billedCents}`);
});

test("event collection allSent uses expected program count; allCollected requires every invoice paid", () => {
  const sent = [
    inv({ id: "1", lines: [fee(1)], sentAt: "2026-10-05T00:00:00Z", payments: [pay(31500)] }),
    inv({ id: "2", lines: [fee(1)], sentAt: "2026-10-05T00:00:00Z", payments: [pay(31500)] }),
  ];
  const eight = eventCollection("evt", sent, 8);
  assert.equal(eight.allSent, false);
  assert.equal(eight.sentCount, 2);
  const two = eventCollection("evt", sent, 2);
  assert.equal(two.allSent, true);
  assert.equal(two.allCollected, true);
  const unpaid = eventCollection("evt", [inv({ id: "1", lines: [fee(1)], payments: [] })], 1);
  assert.equal(unpaid.allSent, true);
  assert.equal(unpaid.allCollected, false);
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
});

test("formatMoney drops cents on whole dollars", () => {
  assert.equal(formatMoney(301500), "$3,015");
  assert.equal(formatMoney(31500), "$315");
  assert.equal(formatMoney(199), "$1.99");
});
