import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupHostedCustomers } from "../../lib/invoicing/group-customers.ts";
import { autoStepDone, teamFeesAreBilled } from "../../lib/invoicing/auto-steps.ts";
import { eventCollection } from "../../packages/invoicing/src/logic.ts";
import type { Invoice } from "../../packages/invoicing/src/types.ts";

test("hostedEventCustomers groups opponents by contact and counts visiting teams", () => {
  const customers = groupHostedCustomers({
    opponents: [
      { id: "o1", contact_id: "c1", name: "Prairie A", status: "yes" },
      { id: "o2", contact_id: "c1", name: "Prairie B", status: "yes" },
      { id: "o3", contact_id: "c2", name: "Metro", status: "declined" },
    ],
    teams: [
      { id: "t1", opponent_id: "o1", ours: false, name: "Prairie 1", division_id: "d1" },
      { id: "t2", opponent_id: "o2", ours: false, name: "Prairie 2", division_id: "d1" },
      { id: "t3", opponent_id: "o1", ours: true, name: "Lightning", division_id: "d1" },
    ],
    divisions: [{ id: "d1", name: "HS Boys", code: "HSA" }],
    contacts: [{ id: "c1", name: "Prairie Hoops", email: "a@example.com", alt_email: "b@example.com" }],
    people: [{ parent_contact_id: "c1", email: "c@example.com" }],
  });
  assert.equal(customers.length, 1);
  assert.equal(customers[0].name, "Prairie Hoops");
  assert.equal(customers[0].teamCount, 2);
  assert.deepEqual(customers[0].emails, ["a@example.com", "b@example.com", "c@example.com"]);
});

test("syncHostedInvoiceSteps ticks and unticks from collection", () => {
  const empty = eventCollection("evt", [], 8);
  assert.equal(autoStepDone("bill_programs", empty), false);
  assert.equal(autoStepDone("invoices_sent", empty), false);
  assert.equal(autoStepDone("team_fees_collected", empty), false);

  const billed: Invoice[] = [
    {
      id: "1",
      number: "INV-2026-0001",
      hostEventId: "evt",
      hostCustomerId: "p1",
      customerName: "Prairie",
      customerEmail: "a@example.com",
      eventLabel: "MRS",
      issuedOn: "2026-10-05",
      dueOn: "2026-11-01",
      depositCents: 0,
      depositDueOn: null,
      sentAt: "2026-10-05T00:00:00Z",
      viewedAt: null,
      voidedAt: null,
      publicToken: "t",
      createdBy: null,
      createdAt: "2026-10-05T00:00:00Z",
      updatedAt: "2026-10-05T00:00:00Z",
      ccEmails: null,
      bccEmails: null,
      reminderFreq: null,
      reminderStartDays: null,
      reminderUntilPaid: null,
      lines: [{ id: "l", description: "fee", qty: 1, unitCents: 31500, sortOrder: 0 }],
      payments: [{ id: "p", method: "venmo", amountCents: 31500, paidOn: "2026-10-10", reference: null, recordedBy: null, createdAt: "2026-10-10T00:00:00Z" }],
    },
  ];
  const one = eventCollection("evt", billed, 1);
  assert.equal(autoStepDone("bill_programs", one), true);
  assert.equal(autoStepDone("invoices_sent", one), true);
  assert.equal(autoStepDone("team_fees_collected", one), true);
  const eight = eventCollection("evt", billed, 8);
  assert.equal(autoStepDone("invoices_sent", eight), false);
  assert.equal(autoStepDone("team_fees_collected", eight), false);
  assert.equal(autoStepDone("bill_programs", eight), true);

  const draftOnly: Invoice[] = [{ ...billed[0], sentAt: null, payments: [] }];
  const drafts = eventCollection("evt", draftOnly, 8);
  assert.equal(drafts.invoiceCount, 1);
  assert.equal(drafts.sentCount, 0);
  assert.equal(drafts.billedCents, 0);
  assert.equal(teamFeesAreBilled(drafts.sentCount), false);
  assert.equal(autoStepDone("bill_programs", drafts), true);
  assert.equal(autoStepDone("team_fees_collected", drafts), false);
});

test("batch preview does not let you edit team counts", () => {
  const batch = readFileSync(join(import.meta.dirname, "../../packages/invoicing/src/ui/BatchBilling.tsx"), "utf8");
  assert.doesNotMatch(batch, /setCounts/);
  assert.doesNotMatch(batch, /aria-label="Teams"/);
  assert.match(batch, /batchPreviewTotals/);
  assert.match(batch, /Teams tab/);
  assert.match(batch, /already billed/);
  assert.match(batch, /disabled=\{busy \|\| actionsOff\}/);
});

test("invoice page keeps a separate error next to each action", () => {
  const detail = readFileSync(join(import.meta.dirname, "../../packages/invoicing/src/ui/InvoiceDetail.tsx"), "utf8");
  assert.match(detail, /sendError/);
  assert.match(detail, /voidError/);
  assert.match(detail, /reminderError/);
  assert.doesNotMatch(detail, /const \[error, setError\]/);
  const plan = readFileSync(join(import.meta.dirname, "../../app/portal/schedule/hosted/[id]/_components/PlanPanel.tsx"), "utf8");
  assert.match(plan, /teamFeesAreBilled/);
});

test("Send invoice is Draft only; Sent and Paid have no Resend invoice", () => {
  const root = join(import.meta.dirname, "../..");
  const detail = readFileSync(join(root, "packages/invoicing/src/ui/InvoiceDetail.tsx"), "utf8");
  const invoicePage = readFileSync(join(root, "app/portal/payments/invoices/[id]/InvoicePage.tsx"), "utf8");
  const service = readFileSync(join(root, "packages/invoicing/src/service.ts"), "utf8");
  const guide = readFileSync(join(root, "lib/help/guide.ts"), "utf8");
  const tours = readFileSync(join(root, "lib/help/tours.ts"), "utf8");
  const list = readFileSync(join(root, "packages/invoicing/src/ui/InvoicesList.tsx"), "utf8");
  assert.match(detail, /\{draft && \(/);
  assert.match(detail, /label="Send invoice"/);
  assert.doesNotMatch(detail, /Resend invoice/);
  assert.doesNotMatch(detail, /draft \? "Send invoice"/);
  assert.doesNotMatch(invoicePage, /Resend invoice/);
  assert.doesNotMatch(list, /Resend invoice/);
  assert.match(service, /A sent invoice can't be edited\. Record a payment or void it and issue a new invoice\./);
  assert.doesNotMatch(service, /or resend it/);
  const invoicesGuide = guide.slice(guide.indexOf('id: "payments-invoices"'), guide.indexOf('id: "payments-messages"'));
  assert.doesNotMatch(invoicesGuide, /Resend invoice/);
  assert.match(invoicesGuide, /\*\*Send invoice\*\* is only on a \*\*Draft\*\*/);
  assert.match(invoicesGuide, /Once it's \*\*Sent\*\* or \*\*Paid\*\*, \*\*Send invoice\*\* is gone/);
  assert.match(invoicesGuide, /\*\*Void invoice\*\* and write a new one/);
  const invoicesTour = tours.slice(tours.indexOf('id: "payments-invoices"'), tours.indexOf('id: "settings-uniforms"'));
  assert.doesNotMatch(invoicesTour, /Resend invoice/);
  assert.match(invoicesTour, /Tap a \*\*Draft\*\* to \*\*Send invoice\*\*/);
  assert.match(invoicesTour, /Once sent, \*\*Send invoice\*\* is gone/);
});

test("invoicing without HS Schedule edit does not load the full hosted page via admin", () => {
  const hostedPage = readFileSync(join(import.meta.dirname, "../../app/portal/schedule/hosted/[id]/page.tsx"), "utf8");
  assert.doesNotMatch(hostedPage, /createAdminClient/);
  assert.match(hostedPage, /Bill programs/);
  const billPage = readFileSync(join(import.meta.dirname, "../../app/portal/schedule/hosted/[id]/bill/page.tsx"), "utf8");
  const billCtx = readFileSync(join(import.meta.dirname, "../../lib/invoicing/bill-context.ts"), "utf8");
  assert.doesNotMatch(billPage, /loadHostedPage/);
  assert.match(billPage, /loadHostedBillContext/);
  assert.match(billPage, /invoicesError=\{viewer\.canManageInvoicing && !listed\.ok \? listed\.error : null\}/);
  assert.match(billCtx, /HOSTED_BILL_WEEKEND_COLUMNS = "id, event"/);
  assert.match(billCtx, /HOSTED_BILL_PLAN_COLUMNS = "weekend_id, hosted, short_name, team_fee_cents"/);
});
