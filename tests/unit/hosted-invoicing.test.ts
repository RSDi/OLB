import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hostedTeamInvoiceCustomerId, hostedTeamInvoiceKeys } from "../../lib/hosted/logic.ts";
import { groupHostedCustomers } from "../../lib/invoicing/group-customers.ts";
import { autoStepDone, teamFeesAreBilled } from "../../lib/invoicing/auto-steps.ts";
import { batchPreviewTotals, customerBillLines, customerBillTotal, eventCollection } from "../../packages/invoicing/src/logic.ts";
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
  // Invoice host_customer_id is the program contact, not the team name — a
  // rename of Prairie 1 still matches the same billed customer.
  assert.equal(customers[0].id, "c1");
  assert.equal(hostedTeamInvoiceCustomerId({ contact_id: "c1", name: "Prairie Hoops" }), customers[0].id);
  assert.deepEqual(hostedTeamInvoiceKeys({ contact_id: "c1", name: "Prairie Hoops" }), [customers[0].id]);
  assert.deepEqual(hostedTeamInvoiceKeys({ contact_id: "c1", name: "Renamed program" }), [customers[0].id]);
});

test("deleteTeam invoice match uses the billed customer id after a team rename", () => {
  const billed = groupHostedCustomers({
    opponents: [{ id: "o1", contact_id: "c1", name: "Prairie A", status: "yes" }],
    teams: [{ id: "t1", opponent_id: "o1", ours: false, name: "Prairie 1 — now Gold", division_id: null }],
    divisions: [],
    contacts: [{ id: "c1", name: "Prairie Hoops", email: null, alt_email: null }],
    people: [],
  });
  assert.equal(billed[0].id, "c1");
  assert.deepEqual(hostedTeamInvoiceKeys({ contact_id: "c1", name: "Prairie A" }), [billed[0].id]);
  const noContact = groupHostedCustomers({
    opponents: [{ id: "o1", contact_id: null, name: "Metro Mavericks", status: "yes" }],
    teams: [{ id: "t1", opponent_id: "o1", ours: false, name: "Metro 1 — now Gold", division_id: null }],
    divisions: [],
    contacts: [],
    people: [],
  });
  assert.equal(noContact[0].id, "name:metro mavericks");
  assert.deepEqual(hostedTeamInvoiceKeys({ contact_id: null, name: "Metro Mavericks" }), [noContact[0].id]);
  const actions = readFileSync(join(import.meta.dirname, "../../lib/hosted/actions.ts"), "utf8");
  assert.match(actions, /hostedTeamInvoiceKeys\(opponent\)/);
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
  const sync = readFileSync(join(import.meta.dirname, "../../lib/invoicing/hosted-sync.ts"), "utf8");
  assert.match(sync, /row\.step_key !== "bill_programs"/);
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
  assert.match(plan, /orderHostedSteps/);
  assert.match(plan, /feeLockNote/);
  assert.match(plan, /\/portal\/schedule\/hosted\/\$\{wid\}\/bill/);
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
  assert.match(billCtx, /HOSTED_BILL_PLAN_COLUMNS = "weekend_id, hosted, short_name, game_fee_cents, games_per_team"/);
});

test("Bill programs prices each team by the game", () => {
  const [storm] = groupHostedCustomers({
    opponents: [{ id: "o1", contact_id: "c1", name: "Sioux City Storm", status: "yes" }],
    teams: [
      { id: "t1", opponent_id: "o1", ours: false, name: "Storm 12U", division_id: null },
      { id: "t2", opponent_id: "o1", ours: false, name: "Storm 13U", division_id: null, games: 4 },
      { id: "t3", opponent_id: "o1", ours: false, name: "Storm 15U", division_id: null, fee_cents: 20000 },
    ],
    divisions: [],
    contacts: [{ id: "c1", name: "Sioux City Storm", email: null, alt_email: null }],
    people: [],
    plan: { game_fee_cents: 10500, games_per_team: 3 },
  });
  assert.equal(storm.teamCount, 3);
  assert.equal(storm.unitCount, 7);
  assert.deepEqual(storm.lines, [
    { description: "Storm 12U games", qty: 3, unitCents: 10500 },
    { description: "Storm 13U games", qty: 4, unitCents: 10500 },
    { description: "Storm 15U team fee", qty: 1, unitCents: 20000 },
  ]);
  assert.equal(customerBillTotal(storm, 10500), 31500 + 42000 + 20000);
  assert.equal(batchPreviewTotals([storm], 10500).totalCents, 93500);
  // No fee per game yet: no lines, the old teamCount × fee.
  const [plain] = groupHostedCustomers({
    opponents: [{ id: "o1", contact_id: "c1", name: "Storm", status: "yes" }],
    teams: [{ id: "t1", opponent_id: "o1", ours: false, name: "Storm 12U", division_id: null }],
    divisions: [],
    contacts: [],
    people: [],
    plan: { game_fee_cents: null, games_per_team: 3 },
  });
  assert.equal(plain.lines, undefined);
  assert.deepEqual(customerBillLines(plain, 24000, "Team fee"), [{ description: "Team fee", qty: 1, unitCents: 24000 }]);
});
