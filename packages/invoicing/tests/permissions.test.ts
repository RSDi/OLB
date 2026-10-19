import { test } from "node:test";
import assert from "node:assert/strict";
import type { InvoicingAdapter } from "../src/adapter.ts";
import { createInvoicingService } from "../src/service.ts";

function deniedAdapter(canInvoice = false): InvoicingAdapter {
  return {
    async getServerClient() {
      throw new Error("db should not be touched when permission is denied");
    },
    getAdminClient() {
      throw new Error("db should not be touched when permission is denied");
    },
    async getCurrentUser() {
      return { id: "u1", email: "coach@example.com", displayName: "Coach" };
    },
    async canInvoice() {
      return canInvoice;
    },
    async canViewInvoices() {
      return true;
    },
    async orgSettings() {
      return {
        fromName: "Org",
        fromEmail: "org@example.com",
        venmoHandle: "handle",
        venmoUrl: "https://venmo.com/u/handle",
        checkPayee: "Org",
        checkAddress: [],
      };
    },
    branding: () => ({ orgName: "Org" }),
    paths: {
      list: "/invoices",
      detail: (id) => `/invoices/${id}`,
      event: (id) => `/events/${id}`,
      create: "/invoices/new",
      publicInvoice: (t) => `/i/${t}`,
    },
    async listEventCustomers() {
      return [];
    },
    async sendEmail() {
      return { ok: true };
    },
    today: () => "2026-10-19",
    publicBaseUrl: () => "https://example.test",
  };
}

test("mutations refuse without invoicing permission", async () => {
  const svc = createInvoicingService(deniedAdapter(false));
  const create = await svc.create({
    customerName: "Prairie Hoops",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(create.ok, false);
  if (!create.ok) assert.match(create.error, /invoicing permission/i);

  const send = await svc.send("00000000-0000-0000-0000-000000000001");
  assert.equal(send.ok, false);

  const pay = await svc.recordPayment("00000000-0000-0000-0000-000000000001", {
    method: "venmo",
    amountCents: 100,
    paidOn: "2026-10-19",
  });
  assert.equal(pay.ok, false);

  const batch = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS 2026",
      feeCents: 31500,
      dueOn: "2026-11-01",
      depositOn: false,
      depositPerTeamCents: 0,
      depositDueOn: null,
      lineDescription: "Team fee",
      customers: [{ id: "p", name: "Prairie", emails: ["a@x.com"], teamCount: 1 }],
    },
    true
  );
  assert.equal(batch.ok, false);

  const rem = await svc.saveReminders({ freq: "off", startDays: 7, untilPaid: true });
  assert.equal(rem.ok, false);
});

test("createBatch send path is locked the same way as Send invoice", async () => {
  const svc = createInvoicingService(deniedAdapter(false));
  const res = await svc.send("any");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, "Requires invoicing permission");
});
