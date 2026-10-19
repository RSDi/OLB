import { test } from "node:test";
import assert from "node:assert/strict";
import type { InvoicingAdapter } from "../src/adapter.ts";
import { createInvoicingService } from "../src/service.ts";

export function deniedAdapter(canInvoice = false, canView = true): InvoicingAdapter {
  return {
    async getServerClient() {
      throw new Error("db should not be touched when permission is denied");
    },
    getAdminClient() {
      throw new Error("db should not be touched when permission is denied");
    },
    async getCurrentUser() {
      return { id: "u1", email: "coach@example.com", displayName: "coach@example.com" };
    },
    async canInvoice() {
      return canInvoice;
    },
    async canViewInvoices() {
      return canView;
    },
    async orgSettings() {
      return {
        fromName: "Org",
        fromEmail: "org@example.com",
        venmoHandle: "handle",
        venmoUrl: "https://venmo.com/u/handle",
        checkPayee: "Org",
        checkAddress: [],
        ccEmails: [],
        bccEmails: [],
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
    async eventFeeCents() {
      return 31500;
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
      customers: [{ id: "p", teamCount: 1 }],
    },
    true
  );
  assert.equal(batch.ok, false);

  const rem = await svc.saveReminders({ freq: "off", startDays: 7, untilPaid: true });
  assert.equal(rem.ok, false);

  const club = await svc.saveClubSettings({ freq: "3d", startDays: 7, untilPaid: true, ccEmails: ["a@b.com"], bccEmails: [] });
  assert.equal(club.ok, false);

  const voided = await svc.voidInvoice("00000000-0000-0000-0000-000000000001");
  assert.equal(voided.ok, false);
});

test("createBatch send path is locked the same way as Send invoice", async () => {
  const svc = createInvoicingService(deniedAdapter(false));
  const res = await svc.send("any");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error, "Requires invoicing permission");
});

test("reads refuse without canViewInvoices", async () => {
  const svc = createInvoicingService(deniedAdapter(false, false));
  const list = await svc.list();
  assert.equal(list.ok, false);
  const get = await svc.get("x");
  assert.equal(get.ok, false);
  const sum = await svc.eventSummary("evt");
  assert.equal(sum.ok, false);
  const rem = await svc.reminders();
  assert.equal(rem.ok, false);
  const club = await svc.clubSettings();
  assert.equal(club.ok, false);
});
