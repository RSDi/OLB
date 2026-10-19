// Invoice mail: non-production never emails real programs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceMailFrom, isProductionMail, sendInvoiceEmail } from "../../lib/invoicing/mail.ts";

test("invoice from-address prefers INVOICE_MAIL_FROM, else MAIL_FROM", () => {
  assert.equal(invoiceMailFrom({ INVOICE_MAIL_FROM: "Finance <invoices@example.com>" }), "Finance <invoices@example.com>");
  assert.match(invoiceMailFrom({ MAIL_FROM: "Club <mail@example.com>" }), /mail@example.com/);
  assert.match(invoiceMailFrom({}), /onboarding@resend.dev/);
});

test("production mail is Vercel production (or NODE_ENV production without VERCEL_ENV)", () => {
  assert.equal(isProductionMail({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionMail({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionMail({ VERCEL_ENV: "development" }), false);
  assert.equal(isProductionMail({ NODE_ENV: "production" }), true);
  assert.equal(isProductionMail({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
});

test("non-production without INVOICE_TEST_EMAIL logs and does not send", async () => {
  const res = await sendInvoiceEmail(
    {
      to: ["program@example.com"],
      subject: "Invoice",
      text: "pay",
      html: "<p>pay</p>",
      kind: "invoice",
      invoiceId: "inv-1",
    },
    { VERCEL_ENV: "preview", RESEND_API_KEY: "re_should_not_be_used" }
  );
  assert.equal(res.ok, true);
});
