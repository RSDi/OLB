// Invoice mail: non-production never emails real programs, including CC/BCC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceMailFrom, isProductionMail, sendInvoiceEmail } from "../../lib/invoicing/mail.ts";

test("invoice from-address prefers INVOICE_MAIL_FROM, else MAIL_FROM", () => {
  assert.equal(invoiceMailFrom({ INVOICE_MAIL_FROM: "Finance <invoices@example.com>" }), "Finance <invoices@example.com>");
  assert.match(invoiceMailFrom({ MAIL_FROM: "Club <mail@example.com>" }), /mail@example.com/);
  assert.match(invoiceMailFrom({}), /onboarding@resend.dev/);
});

test("production mail is only Vercel production, not a local production build", () => {
  assert.equal(isProductionMail({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionMail({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionMail({ VERCEL_ENV: "development" }), false);
  assert.equal(isProductionMail({ NODE_ENV: "production" }), false);
  assert.equal(isProductionMail({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
});

test("non-production without INVOICE_TEST_EMAIL logs and does not report success", async () => {
  const res = await sendInvoiceEmail(
    {
      to: ["program@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Invoice",
      text: "pay",
      html: "<p>pay</p>",
      kind: "invoice",
      invoiceId: "inv-1",
    },
    { VERCEL_ENV: "preview", RESEND_API_KEY: "re_should_not_be_used" }
  );
  assert.equal(res.ok, false);
  assert.equal(res.logged, true);
});

test("non-production with INVOICE_TEST_EMAIL redirects To/CC/BCC to the test inbox", async () => {
  const calls: unknown[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      {
        to: ["program@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Invoice INV-1",
        text: "pay",
        html: "<p>pay</p>",
        kind: "invoice",
        invoiceId: "inv-1",
      },
      { VERCEL_ENV: "preview", INVOICE_TEST_EMAIL: "jeff@example.com", RESEND_API_KEY: "re_test" }
    );
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    const body = calls[0] as { to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string };
    assert.deepEqual(body.to, ["jeff@example.com"]);
    assert.equal(body.cc, undefined);
    assert.equal(body.bcc, undefined);
    assert.match(body.subject, /^\[TEST → /);
    assert.match(body.text, /program@example.com/);
    assert.match(body.text, /cc@example.com/);
    assert.match(body.text, /bcc@example.com/);
  } finally {
    globalThis.fetch = orig;
  }
});
