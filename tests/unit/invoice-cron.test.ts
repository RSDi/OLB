import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invoiceCronUnauthorized } from "../../lib/invoicing/cron-auth.ts";

test("invoice reminder cron is 401 without a bearer secret", () => {
  assert.equal(invoiceCronUnauthorized(null, "secret"), true);
  assert.equal(invoiceCronUnauthorized("Bearer nope", "secret"), true);
  assert.equal(invoiceCronUnauthorized("Bearer secret", "secret"), false);
});

test("invoice reminder cron is 401 when CRON_SECRET is unset", () => {
  assert.equal(invoiceCronUnauthorized("Bearer anything", undefined), true);
  assert.equal(invoiceCronUnauthorized("Bearer anything", ""), true);
});

test("cron route uses the fail-closed helper", () => {
  const route = readFileSync(join(import.meta.dirname, "../../app/api/cron/invoice-reminders/route.ts"), "utf8");
  assert.match(route, /invoiceCronUnauthorized/);
  assert.match(route, /status: 401/);
});
