import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { invoiceCronUnauthorized, runInvoiceReminderCron } from "../../lib/invoicing/cron-auth.ts";

test("invoice reminder cron is 401 without a bearer secret", () => {
  assert.equal(invoiceCronUnauthorized(null, "secret"), true);
  assert.equal(invoiceCronUnauthorized("Bearer nope", "secret"), true);
  assert.equal(invoiceCronUnauthorized("Bearer secret", "secret"), false);
});

test("invoice reminder cron is 401 when CRON_SECRET is unset", () => {
  assert.equal(invoiceCronUnauthorized("Bearer anything", undefined), true);
  assert.equal(invoiceCronUnauthorized("Bearer anything", ""), true);
});

test("cron GET is 401 without a matching bearer (route handler, not just the helper)", async () => {
  let ran = false;
  const res = await runInvoiceReminderCron(
    new Request("https://example.test/api/cron/invoice-reminders"),
    { CRON_SECRET: "secret", SUPABASE_SERVICE_ROLE_KEY: "svc" },
    async () => {
      ran = true;
      return { sent: 1 };
    }
  );
  assert.equal(res.status, 401);
  assert.equal(ran, false);

  const bad = await runInvoiceReminderCron(
    new Request("https://example.test/api/cron/invoice-reminders", { headers: { authorization: "Bearer nope" } }),
    { CRON_SECRET: "secret", SUPABASE_SERVICE_ROLE_KEY: "svc" },
    async () => {
      ran = true;
      return { sent: 1 };
    }
  );
  assert.equal(bad.status, 401);

  const ok = await runInvoiceReminderCron(
    new Request("https://example.test/api/cron/invoice-reminders", { headers: { authorization: "Bearer secret" } }),
    { CRON_SECRET: "secret", SUPABASE_SERVICE_ROLE_KEY: "svc" },
    async () => ({ sent: 2 })
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { sent: 2 });
});

test("cron route uses the fail-closed handler", () => {
  const route = readFileSync(join(import.meta.dirname, "../../app/api/cron/invoice-reminders/route.ts"), "utf8");
  assert.match(route, /runInvoiceReminderCron/);
  assert.doesNotMatch(route, /createAdminClient/);
});
