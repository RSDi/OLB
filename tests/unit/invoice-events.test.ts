import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rowsOrThrow } from "../../lib/invoicing/query.ts";

test("New invoice page loads hosted events and their registered programs", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/page.tsx"), "utf8");
  const client = readFileSync(join(import.meta.dirname, "../../app/portal/payments/invoices/new/NewInvoicePage.tsx"), "utf8");
  assert.match(page, /loadNewInvoiceFormData/);
  assert.doesNotMatch(page, /customersByEvent\[event\.id\] = \[\]/);
  assert.match(client, /customersErrorByEvent=\{customersErrorByEvent\}/);
  assert.match(client, /eventsError=\{eventsError\}/);
});

test("a Supabase error is not an empty program list", () => {
  assert.throws(
    () => rowsOrThrow({ data: null, error: { message: "relation hs_opponents does not exist" } }),
    /relation hs_opponents does not exist/
  );
  assert.throws(() => rowsOrThrow({ data: [], error: { message: "timeout" } }), /timeout/);
  assert.deepEqual(rowsOrThrow({ data: [{ id: "1" }], error: null }), [{ id: "1" }]);
  assert.deepEqual(rowsOrThrow({ data: null, error: null }), []);
  const customers = readFileSync(join(import.meta.dirname, "../../lib/invoicing/customers.ts"), "utf8");
  const events = readFileSync(join(import.meta.dirname, "../../lib/invoicing/events.ts"), "utf8");
  assert.match(customers, /rowsOrThrow/);
  assert.match(events, /if \(error\) throw/);
  assert.match(events, /customersErrorByEvent\[event\.id\] = true/);
});
