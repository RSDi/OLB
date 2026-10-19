import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invoiceEventsFromRows } from "../../lib/invoicing/events.ts";

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

test("New invoice page loads hosted events and their registered programs", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/page.tsx"), "utf8");
  const client = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/NewInvoicePage.tsx"), "utf8");
  const actions = readFileSync(join(import.meta.dirname, "../../lib/invoicing/actions.ts"), "utf8");
  assert.match(page, /listInvoiceEvents/);
  assert.match(client, /listInvoiceEventCustomersAction/);
  assert.match(client, /events=\{events\}/);
  assert.match(actions, /hostedEventCustomers/);
  assert.match(actions, /listInvoiceEventCustomersAction/);
});
