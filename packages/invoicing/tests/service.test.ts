import { test } from "node:test";
import assert from "node:assert/strict";
import type { InvoicingAdapter, OrgSettings } from "../src/adapter.ts";
import { createInvoicingService } from "../src/service.ts";
import { MemoryDb } from "./fake-db.ts";
import type { EventCustomer, InvoiceEmail, MailSendResult } from "../src/types.ts";

function makeAdapter(opts: {
  db: MemoryDb;
  send?: (mail: InvoiceEmail) => Promise<MailSendResult>;
  customers?: EventCustomer[];
  org?: Partial<OrgSettings>;
  canInvoice?: boolean;
  canView?: boolean;
  feeCents?: number | null;
  today?: () => string;
}): InvoicingAdapter {
  const send =
    opts.send ??
    (async () => ({ ok: true } as MailSendResult));
  return {
    async getServerClient() {
      return opts.db.client() as never;
    },
    getAdminClient() {
      return opts.db.client() as never;
    },
    async getCurrentUser() {
      return { id: "u1", email: "treasurer@example.com", displayName: "treasurer@example.com" };
    },
    async canInvoice() {
      return opts.canInvoice !== false;
    },
    async canViewInvoices() {
      return opts.canView !== false;
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
        ...opts.org,
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
      return (
        opts.customers ?? [
          { id: "p1", name: "Prairie", emails: ["a@example.com", "b@example.com"], teamCount: 2 },
          { id: "p2", name: "Metro", emails: ["c@example.com"], teamCount: 1 },
        ]
      );
    },
    async eventFeeCents() {
      return opts.feeCents === undefined ? 31500 : opts.feeCents;
    },
    sendEmail: send,
    today: () => (opts.today ? opts.today() : "2026-10-19"),
    publicBaseUrl: () => "https://example.test",
  };
}

test("failed send leaves the invoice a Draft", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(
    makeAdapter({
      db,
      send: async () => ({ ok: false, error: "The email didn't go through." }),
    })
  );
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const sent = await svc.send(created.data.id);
  assert.equal(sent.ok, false);
  const got = await svc.get(created.data.id);
  assert.equal(got.ok, true);
  if (got.ok) {
    assert.equal(got.data.sentAt, null);
    assert.equal(got.data.issuedOn, null);
  }
});

test("logged-only send is not Sent", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(
    makeAdapter({
      db,
      send: async () => ({ ok: false, logged: true, error: "Not sent (logged only). Set INVOICE_TEST_EMAIL to deliver to a test inbox." }),
    })
  );
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const sent = await svc.send(created.data.id);
  assert.equal(sent.ok, false);
  if (!sent.ok) assert.match(sent.error, /logged only/i);
  const got = await svc.get(created.data.id);
  if (got.ok) assert.equal(got.data.sentAt, null);
});

test("successful send stamps sent_at and uses every program email", async () => {
  const db = new MemoryDb();
  const captured: InvoiceEmail[] = [];
  const svc = createInvoicingService(
    makeAdapter({
      db,
      org: { ccEmails: ["clubcc@example.com"], bccEmails: ["clubbcc@example.com"] },
      send: async (mail) => {
        captured.push(mail);
        return { ok: true };
      },
    })
  );
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com, b@example.com",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const sent = await svc.send(created.data.id);
  assert.equal(sent.ok, true);
  if (sent.ok) assert.ok(sent.data.sentAt);
  assert.deepEqual(captured[0]?.to, ["a@example.com", "b@example.com"]);
  assert.deepEqual(captured[0]?.cc, ["clubcc@example.com"]);
  assert.deepEqual(captured[0]?.bcc, ["clubbcc@example.com"]);
});

test("invoice CC/BCC override replaces club defaults on send and reminders", async () => {
  const db = new MemoryDb();
  const mails: InvoiceEmail[] = [];
  const svc = createInvoicingService(
    makeAdapter({
      db,
      org: { ccEmails: ["clubcc@example.com"], bccEmails: ["clubbcc@example.com"] },
      send: async (mail) => {
        mails.push(mail);
        return { ok: true };
      },
    })
  );
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-10-01",
    ccEmails: ["invcc@example.com"],
    bccEmails: [],
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await svc.send(created.data.id);
  assert.equal(mails[0]?.kind, "invoice");
  assert.deepEqual(mails[0]?.cc, ["invcc@example.com"]);
  assert.deepEqual(mails[0]?.bcc, []);

  const rem = await svc.runReminders();
  assert.equal(rem.sent, 1);
  const reminder = mails.find((m) => m.kind === "reminder");
  assert.ok(reminder);
  assert.deepEqual(reminder?.cc, ["invcc@example.com"]);
  assert.deepEqual(reminder?.bcc, []);
});

test("createBatch CC/BCC override is stored and used instead of club defaults", async () => {
  const db = new MemoryDb();
  const mails: InvoiceEmail[] = [];
  const svc = createInvoicingService(
    makeAdapter({
      db,
      org: { ccEmails: ["clubcc@example.com"], bccEmails: ["clubbcc@example.com"] },
      send: async (mail) => {
        mails.push(mail);
        return { ok: true };
      },
    })
  );
  const res = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS",
      feeCents: 31500,
      dueOn: "2026-11-01",
      depositOn: false,
      depositPerTeamCents: 0,
      depositDueOn: null,
      lineDescription: "Team fee",
      customers: [{ id: "p1", teamCount: 1 }],
      ccEmails: ["batchcc@example.com"],
      bccEmails: [],
    },
    true
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.sent, 1);
  assert.deepEqual(res.data.invoices[0].ccEmails, ["batchcc@example.com"]);
  assert.deepEqual(res.data.invoices[0].bccEmails, []);
  assert.deepEqual(mails[0]?.cc, ["batchcc@example.com"]);
  assert.deepEqual(mails[0]?.bcc, []);
});

test("saveClubSettings validates emails and requires invoicing", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db }));
  const bad = await svc.saveClubSettings({ freq: "3d", startDays: 7, untilPaid: true, ccEmails: ["nope"], bccEmails: [] });
  assert.equal(bad.ok, false);
  const ok = await svc.saveClubSettings({ freq: "weekly", startDays: 5, untilPaid: false, ccEmails: ["cc@example.com"], bccEmails: [] });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.freq, "weekly");
    assert.deepEqual(ok.data.ccEmails, ["cc@example.com"]);
  }
});

test("getPublic: unsent and malformed tokens are not found", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db }));
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const unsent = await svc.getPublic(created.data.publicToken);
  assert.equal(unsent.ok, false);
  const bad = await svc.getPublic("not-a-token");
  assert.equal(bad.ok, false);
});

test("createBatch skips already billed programs and updates an existing draft", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(
    makeAdapter({
      db,
      send: async () => ({ ok: true }),
    })
  );
  const first = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS",
      feeCents: 99999,
      dueOn: "2026-11-01",
      depositOn: false,
      depositPerTeamCents: 0,
      depositDueOn: null,
      lineDescription: "Team fee",
      customers: [{ id: "p1", teamCount: 2 }],
    },
    false
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.data.invoices.length, 1);
  assert.equal(first.data.invoices[0].lines[0].unitCents, 31500);
  const id = first.data.invoices[0].id;
  const again = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS",
      feeCents: 31500,
      dueOn: "2026-11-06",
      depositOn: true,
      depositPerTeamCents: 10000,
      depositDueOn: "2026-10-26",
      lineDescription: "Team fee",
      customers: [{ id: "p1", teamCount: 3 }],
    },
    false
  );
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.data.invoices.length, 1);
  assert.equal(again.data.invoices[0].id, id);
  assert.equal(again.data.invoices[0].lines[0].qty, 2);
  assert.equal(again.data.invoices[0].dueOn, "2026-11-06");
  await svc.send(id);
  const billed = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS",
      feeCents: 31500,
      dueOn: "2026-11-01",
      depositOn: false,
      depositPerTeamCents: 0,
      depositDueOn: null,
      lineDescription: "Team fee",
      customers: [{ id: "p1", teamCount: 3 }],
    },
    true
  );
  assert.equal(billed.ok, true);
  if (billed.ok) {
    assert.ok(billed.data.skipped.some((s) => /already billed/i.test(s)));
    assert.equal(billed.data.sent, 0);
  }
});

test("createBatch does not stamp Sent when a program has no email", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(
    makeAdapter({
      db,
      customers: [{ id: "p1", name: "Silent", emails: [], teamCount: 1 }],
    })
  );
  const res = await svc.createBatch(
    {
      eventId: "evt",
      eventLabel: "MRS",
      feeCents: 31500,
      dueOn: "2026-11-01",
      depositOn: false,
      depositPerTeamCents: 0,
      depositDueOn: null,
      lineDescription: "Team fee",
      customers: [{ id: "p1", teamCount: 1 }],
    },
    true
  );
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.sent, 0);
  assert.equal(res.data.invoices[0].sentAt, null);
  assert.ok(res.data.skipped.some((s) => /no program email/i.test(s)));
});

test("runReminders: unique per day, 3-reminder cap, no email fails", async () => {
  const db = new MemoryDb();
  let today = "2026-10-19";
  const captured: InvoiceEmail[] = [];
  const svc = createInvoicingService(
    makeAdapter({
      db,
      today: () => today,
      org: { ccEmails: ["clubcc@example.com"], bccEmails: ["clubbcc@example.com"] },
      send: async (mail) => {
        captured.push(mail);
        return { ok: true };
      },
    })
  );
  await svc.saveReminders({ freq: "3d", startDays: 7, untilPaid: false });
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-10-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  await svc.send(created.data.id);
  const first = await svc.runReminders();
  assert.equal(first.sent, 1);
  const reminder = captured.find((m) => m.kind === "reminder");
  assert.ok(reminder);
  assert.deepEqual(reminder?.cc, ["clubcc@example.com"]);
  assert.deepEqual(reminder?.bcc, ["clubbcc@example.com"]);
  const again = await svc.runReminders();
  assert.equal(again.sent, 0);
  assert.ok(again.skipped >= 1);

  today = "2026-10-22";
  assert.equal((await svc.runReminders()).sent, 1);
  today = "2026-10-25";
  assert.equal((await svc.runReminders()).sent, 1);
  today = "2026-10-28";
  const capped = await svc.runReminders();
  assert.equal(capped.sent, 0);

  const noMail = await svc.create({
    customerName: "No Mail",
    customerEmail: null,
    dueOn: "2026-10-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(noMail.ok, true);
  if (!noMail.ok) return;
  db.invoices.find((r) => r.id === noMail.data.id)!.sent_at = new Date().toISOString();
  const failed = await svc.runReminders();
  assert.ok(failed.failed >= 1);
});

function batchInput(extra: Partial<{ customers: { id: string; teamCount: number }[]; ccEmails: string[] | null; bccEmails: string[] | null; feeCents: number }> = {}) {
  return {
    eventId: "evt",
    eventLabel: "MRS",
    feeCents: extra.feeCents ?? 99999,
    dueOn: "2026-11-01",
    depositOn: false,
    depositPerTeamCents: 0,
    depositDueOn: null,
    lineDescription: "Team fee",
    customers: extra.customers ?? [{ id: "p1", teamCount: 1 }],
    ccEmails: extra.ccEmails,
    bccEmails: extra.bccEmails,
  };
}

test("createBatch refuses when the host has no team fee", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db, feeCents: null }));
  const res = await svc.createBatch(batchInput(), false);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /team fee/i);
});

test("createBatch uses the server team count, not the browser's", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db }));
  const res = await svc.createBatch(batchInput({ customers: [{ id: "p1", teamCount: 99 }] }), false);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.invoices[0].lines[0].qty, 2);
  assert.equal(res.data.invoices[0].lines[0].unitCents, 31500);
});

test("re-saving a batch without a CC override keeps a draft's copies", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db }));
  const first = await svc.create({
    hostEventId: "evt",
    hostCustomerId: "p1",
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-11-01",
    ccEmails: ["invcc@example.com"],
    bccEmails: [],
    lines: [{ description: "Team fee", qty: 2, unitCents: 31500 }],
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const again = await svc.createBatch(batchInput({ ccEmails: null, bccEmails: null, customers: [{ id: "p1", teamCount: 2 }] }), false);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.data.invoices[0].ccEmails, ["invcc@example.com"]);
  assert.deepEqual(again.data.invoices[0].bccEmails, []);
});

test("invalid per-invoice reminder values are normalized on save", async () => {
  const db = new MemoryDb();
  const svc = createInvoicingService(makeAdapter({ db }));
  const created = await svc.create({
    customerName: "Prairie",
    customerEmail: "a@example.com",
    dueOn: "2026-11-01",
    lines: [{ description: "Team fee", qty: 1, unitCents: 31500 }],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const saved = await svc.update(created.data.id, {
    reminderFreq: "nope" as never,
    reminderStartDays: 99,
    reminderUntilPaid: true,
  });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.data.reminderFreq, "3d");
  assert.equal(saved.data.reminderStartDays, 7);
  assert.equal(saved.data.reminderUntilPaid, true);
});
