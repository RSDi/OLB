import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
test("New invoice page loads hosted events and their registered programs", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/page.tsx"), "utf8");
  const client = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/NewInvoicePage.tsx"), "utf8");
  assert.match(page, /listInvoiceEvents/);
  assert.match(page, /hostedEventCustomers/);
  assert.match(client, /customersByEvent=\{customersByEvent\}/);
  assert.match(client, /events=\{events\}/);
});
