// Club finances (0131): fee tiers from Settings → Fees, budget vs paid, team
// splits, fundraiser shifts, programs, the Snapshot, and the forms' clean-up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FEE_TIERS, cleanTiers, feeTiersFrom, tierForAge, tierText } from "../../lib/finances/fees.ts";
import { FEE_TIERS, isHighSchoolTier, suggestedTier } from "../../lib/teams/registration-form.ts";
import { registrationFeeCents } from "../../lib/finances/logic.ts";
import {
  buildSnapshot,
  cleanIncomeInput,
  cleanLineInput,
  cleanShiftInput,
  groupRows,
  lastChoiceFor,
  priceRange,
  programTotals,
  shiftAmountCents,
  signupState,
  coveredByNelsons,
  NELSONS_REF,
  snapshotCsv,
  spendBy,
  splitEvenly,
} from "../../lib/finances/club-logic.ts";
import { nameKey, priceFor, signupProblem } from "../../lib/finances/program-signup.ts";
import type { BudgetLine, ClubData, ExpensePayment } from "../../lib/finances/club-types.ts";

test("the built-in tiers read exactly as the form always wrote them", () => {
  assert.deepEqual(FEE_TIERS, ["8u-12u - $375.00", "14u - $400.00", "16u-18u - $525.00"]);
  assert.equal(registrationFeeCents(tierText(DEFAULT_FEE_TIERS[2])), 52500);
});

test("Settings' tiers drive the suggested fee; nothing saved means the built-in ones", () => {
  const tiers = feeTiersFrom([
    { label: "HS", max_age: null, cents: 55000 },
    { label: "10u", max_age: 10, cents: 30000 },
    { label: "14u", max_age: 14, cents: 42500 },
  ]);
  assert.deepEqual(
    tiers.map((t) => t.label),
    ["10u", "14u", "HS"]
  );
  assert.equal(tierForAge(9, tiers)?.label, "10u");
  assert.equal(tierForAge(11, tiers)?.label, "14u");
  assert.equal(tierForAge(17, tiers)?.label, "HS");
  assert.equal(suggestedTier("2016-01-01", tiers), "10u - $300.00");
  assert.equal(suggestedTier("2014-08-01"), FEE_TIERS[0]);
  assert.deepEqual(feeTiersFrom([]), DEFAULT_FEE_TIERS);
  assert.deepEqual(feeTiersFrom(null), DEFAULT_FEE_TIERS);
  assert.ok(isHighSchoolTier("HS - $550.00"));
  assert.ok(!isHighSchoolTier("14u - $425.00"));
});

test("cleanTiers wants names, fees and exactly one tier with no age", () => {
  assert.deepEqual(
    cleanTiers([
      { label: "16u-18u", max_age: "", amount: "525" },
      { label: "8u-12u", max_age: "12", amount: "$375" },
    ]),
    [
      { label: "8u-12u", max_age: 12, cents: 37500 },
      { label: "16u-18u", max_age: null, cents: 52500 },
    ]
  );
  assert.ok("error" in (cleanTiers([{ label: "A", max_age: "12", amount: "1" }]) as object));
  assert.ok("error" in (cleanTiers([{ label: "A", max_age: "", amount: "1" }, { label: "B", max_age: "", amount: "2" }]) as object));
  assert.ok("error" in (cleanTiers([{ label: "A", max_age: "", amount: "x" }]) as object));
});

const line = (id: string, over: Partial<BudgetLine> = {}): BudgetLine => ({
  id,
  group_id: "g1",
  team_id: null,
  program_id: null,
  event_id: null,
  vendor: null,
  description: id,
  month: null,
  budget_cents: 0,
  note: null,
  created_at: "2026-10-01T00:00:00Z",
  voided_at: null,
  ...over,
});
const pay = (line_id: string, amount_cents: number, over: Partial<ExpensePayment> = {}): ExpensePayment => ({
  id: `${line_id}-${amount_cents}`,
  line_id,
  amount_cents,
  paid_on: "2026-10-01",
  method: "check",
  reference: null,
  note: null,
  recorded_by: null,
  voided_at: null,
  ...over,
});

test("budget vs paid by group and by team; voided lines and payments don't count", () => {
  const lines = [
    line("ins", { budget_cents: 53000 }),
    line("iowa", { group_id: "g2", team_id: "white", budget_cents: 15000 }),
    line("gone", { budget_cents: 99999, voided_at: "2026-10-02" }),
  ];
  const payments = [pay("ins", 53000), pay("iowa", 10000), pay("iowa", 5000, { voided_at: "2026-10-03" })];
  const rows = groupRows(
    [
      { id: "g2", name: "Teams", sort_order: 20 },
      { id: "g1", name: "General", sort_order: 10 },
    ],
    lines,
    payments
  );
  assert.deepEqual(
    rows.map((r) => [r.group.name, r.spend]),
    [
      ["General", { budget: 53000, paid: 53000 }],
      ["Teams", { budget: 15000, paid: 10000 }],
    ]
  );
  assert.deepEqual(spendBy("team_id", lines, payments).get("white"), { budget: 15000, paid: 10000 });
});

test("a split always adds back up to the total", () => {
  assert.deepEqual(splitEvenly(26000, 3), [8667, 8667, 8666]);
  assert.equal(
    splitEvenly(10001, 7).reduce((a, b) => a + b, 0),
    10001
  );
  assert.deepEqual(splitEvenly(500, 0), []);
});

test("a shift earns hours × rate, or what's typed; the worker picks where it goes", () => {
  assert.equal(shiftAmountCents(4.25, 1000), 4250);
  assert.equal(shiftAmountCents(3.42, 1000), 3420);
  const base = { fundraiser_id: "f", event_label: "Tulip Festival", worked_on: "", worker_name: "Sarah Wesner", hours: "4", amount: "", destination: "family", player_id: "p1", fund_id: "", note: "" };
  const c = cleanShiftInput(base, 1000);
  assert.ok(!("error" in c));
  assert.equal((c as { amount_cents: number }).amount_cents, 4000);
  assert.equal((c as { fund_id: string | null }).fund_id, null);
  const fund = cleanShiftInput({ ...base, destination: "fund", fund_id: "b4b", amount: "20.50" }, 1000);
  assert.deepEqual([(fund as { player_id: null }).player_id, (fund as { amount_cents: number }).amount_cents], [null, 2050]);
  assert.ok("error" in (cleanShiftInput({ ...base, player_id: "" }, 1000) as object));
  assert.ok("error" in (cleanShiftInput({ ...base, hours: "0" }, 1000) as object));
  assert.ok("error" in (cleanShiftInput({ ...base, destination: "nowhere" }, 1000) as object));
});

test("a worker's next shift starts from their last choice", () => {
  const shifts = [
    { worker_name: "Wes Santo", destination: "family" as const, player_id: "levi", fund_id: null, created_at: "2026-05-01", voided_at: null },
    { worker_name: "wes santo ", destination: "fund" as const, player_id: null, fund_id: "b4b", created_at: "2026-06-01", voided_at: null },
    { worker_name: "Wes Santo", destination: "family" as const, player_id: "ezra", fund_id: null, created_at: "2026-07-01", voided_at: "2026-07-02" },
  ];
  assert.deepEqual(lastChoiceFor("Wes Santo", shifts), { destination: "fund", player_id: null, fund_id: "b4b" });
  assert.equal(lastChoiceFor("Nobody", shifts), null);
});

test("cost lines need a group and a name; month is the first of the month", () => {
  const ok = cleanLineInput({ group_id: "g", team_id: "", program_id: "", event_id: "", vendor: " St Marks ", description: "Gym", month: "2026-10", budget: "1,100", note: "" });
  assert.deepEqual(ok, { group_id: "g", team_id: null, program_id: null, event_id: null, vendor: "St Marks", description: "Gym", month: "2026-10-01", budget_cents: 110000, note: null });
  assert.ok("error" in (cleanLineInput({ group_id: "", team_id: "", program_id: "", event_id: "", vendor: "", description: "Gym", month: "", budget: "", note: "" }) as object));
});

test("income can be only expected until it comes in", () => {
  const blank = { category: "event", description: "", from_name: "", amount: "", budget: "4000", received_on: "", method: "", reference: "", program_id: "", event_id: "mrs", fund_id: "", note: "" };
  const expected = cleanIncomeInput(blank);
  assert.ok(!("error" in expected));
  assert.deepEqual([(expected as { amount_cents: number }).amount_cents, (expected as { received_on: null }).received_on], [0, null]);
  assert.ok("error" in (cleanIncomeInput({ ...blank, budget: "" }) as object));
  assert.ok("error" in (cleanIncomeInput({ ...blank, amount: "1000", received_on: "" }) as object));
  const came = cleanIncomeInput({ ...blank, category: "donation", from_name: "Lanphier", amount: "2000", received_on: "2026-09-01", method: "check", budget: "" });
  assert.equal((came as { description: string }).description, "Donation: Lanphier");
});

test("program prices, sign-up state and the sign-up form", () => {
  const levels = [
    { label: "Junior high", cents: 6000 },
    { label: "High school", cents: 10000 },
  ];
  assert.equal(priceRange(levels), "$60–$100");
  assert.equal(priceRange([{ label: "Everyone", cents: 6000 }]), "$60");
  assert.deepEqual(priceFor(levels, "High school"), { label: "High school", cents: 10000 });
  assert.deepEqual(priceFor([{ label: "Everyone", cents: 6000 }], ""), { label: "Everyone", cents: 6000 });
  assert.equal(signupState({ charge_id: "c", price_cents: 6000, paid_cents: 0, paid_method: null }), "on_account");
  assert.equal(signupState({ charge_id: null, price_cents: 6000, paid_cents: 6000, paid_method: "venmo" }), "paid");
  assert.equal(signupState({ charge_id: null, price_cents: 6000, paid_cents: 0, paid_method: null }), "owes");
  assert.equal(signupState({ charge_id: null, price_cents: 6000, paid_cents: 0, paid_method: "waived" }), "waived");
  assert.equal(nameKey(" Caleb ", "Van  Schooneveld"), "caleb van schooneveld");
  const kid = { key: "a", first: "Sam", last: "Carter", dob: "2014-02-01", level: "" };
  assert.match(signupProblem({ parent_name: "Pat", email: "pat@x.com", phone: "", note: "", kids: [kid] }, levels) ?? "", /pick a group/);
  assert.equal(signupProblem({ parent_name: "Pat", email: "pat@x.com", phone: "", note: "", kids: [{ ...kid, level: "Junior high" }] }, levels), null);
  assert.match(signupProblem({ parent_name: "Pat", email: "nope", phone: "", note: "", kids: [{ ...kid, level: "Junior high" }] }, levels) ?? "", /email/);
});

function club(over: Partial<ClubData> = {}): ClubData {
  return {
    board: { id: "b", season: "2026-2027" },
    settings: { board_id: "b", enabled: true, fee_tiers: DEFAULT_FEE_TIERS, custom_tiers: false, comp_coach_kids: true, coach_comp_cents: null, fundraising_rate_cents: 1000, default_due_on: null },
    groups: [{ id: "g1", name: "General", sort_order: 10 }],
    lines: [],
    expensePayments: [],
    lineCharges: [],
    income: [],
    events: [],
    programs: [],
    signups: [],
    signupCharges: [],
    funds: [{ id: "b4b", name: "General program fund", description: null, archived_at: null }],
    fundraisers: [{ id: "nel", name: "Nelson's Produce", rate_cents: 1000, archived_at: null }],
    shifts: [],
    teams: [{ id: "white", name: "14u White" }],
    players: [],
    families: { charged: 100000, credited: 10000, paid: 60000, owed: 30000, owing: 2 },
    ...over,
  };
}

test("program totals: roster fees on the account, everyone else on the sign-up", () => {
  const data = club({
    programs: [{ id: "sc", name: "Summer Clinics", kind: "clinic", starts_on: null, ends_on: null, schedule: null, location: null, description: null, levels: [{ label: "Everyone", cents: 6000 }], open: true, capacity: null, archived_at: null }],
    signups: [
      { id: "1", program_id: "sc", player_id: "p", child_first: "A", child_last: "B", child_dob: null, level: null, price_cents: 6000, parent_name: null, parent_email: null, parent_phone: null, note: null, charge_id: "c1", paid_cents: 0, paid_on: null, paid_method: null, paid_ref: null, created_at: "", cancelled_at: null },
      { id: "2", program_id: "sc", player_id: null, child_first: "C", child_last: "D", child_dob: null, level: null, price_cents: 6000, parent_name: null, parent_email: null, parent_phone: null, note: null, charge_id: null, paid_cents: 6000, paid_on: null, paid_method: "cash", paid_ref: null, created_at: "", cancelled_at: null },
      { id: "3", program_id: "sc", player_id: null, child_first: "E", child_last: "F", child_dob: null, level: null, price_cents: 6000, parent_name: null, parent_email: null, parent_phone: null, note: null, charge_id: null, paid_cents: 0, paid_on: null, paid_method: null, paid_ref: null, created_at: "", cancelled_at: "x" },
    ],
    signupCharges: [{ id: "c1", player_id: "p", amount_cents: 6000, voided_at: null }],
    lines: [line("gym", { program_id: "sc", budget_cents: 248000 })],
    expensePayments: [pay("gym", 248000)],
  });
  assert.deepEqual(programTotals("sc", data), { signups: 2, billed: 12000, collected: 6000, costs: { budget: 248000, paid: 248000 } });
});

test("a sign-up paid from Nelson's is a charge on the account, and counts in the program's fees", () => {
  const base = { id: "n", program_id: "sc", player_id: "p", child_first: "Nate", child_last: "Wesner", child_dob: null, level: null, price_cents: 6000, parent_name: null, parent_email: null, parent_phone: null, note: null, paid_cents: 0, paid_on: null, created_at: "", cancelled_at: null };
  const covered = { ...base, charge_id: "c", paid_method: null, paid_ref: NELSONS_REF };
  const waived = { ...base, charge_id: null, paid_method: "waived" as const, paid_ref: NELSONS_REF };
  assert.equal(coveredByNelsons(covered), true);
  assert.equal(signupState(covered), "on_account");
  // The old import's "waived" isn't on any account: not covered, and no fee.
  assert.equal(coveredByNelsons(waived), false);
  assert.equal(coveredByNelsons({ ...covered, paid_ref: null }), false);
  const data = club({ signups: [covered], signupCharges: [{ id: "c", player_id: "p", amount_cents: 6000, voided_at: null }] });
  assert.equal(programTotals("sc", data).billed, 6000);
  assert.equal(programTotals("sc", club({ signups: [waived] })).billed, 0);
});

test("the Snapshot adds up money in and out, teams, events and funds", () => {
  const data = club({
    lines: [line("ins", { budget_cents: 53000 }), line("iowa", { team_id: "white", budget_cents: 15000 }), line("courts", { event_id: "mrs", budget_cents: 240000 })],
    expensePayments: [pay("ins", 53000), pay("iowa", 10000), pay("courts", 240000)],
    lineCharges: [{ line_id: "iowa", charge_id: "x", amount_cents: 15000, voided: false }],
    events: [{ id: "mrs", name: "MRS", starts_on: null, ends_on: null, note: null, archived_at: null }],
    income: [
      { id: "i1", category: "donation", program_id: null, event_id: null, fund_id: null, from_name: "Lanphier", description: "Donation", amount_cents: 200000, received_on: "2026-09-01", budget_cents: null, method: "check", reference: null, note: null, voided_at: null },
      { id: "i2", category: "event", program_id: null, event_id: "mrs", fund_id: null, from_name: null, description: "MRS registration", amount_cents: 0, received_on: null, budget_cents: 400000, method: null, reference: null, note: null, voided_at: null },
    ],
    shifts: [
      { id: "s1", fundraiser_id: "nel", event_label: "Tulip", worked_on: null, worker_name: "Sarah", hours: 4, amount_cents: 4000, destination: "family", player_id: "p", fund_id: null, charge_id: "c", note: null, created_at: "", voided_at: null },
      { id: "s2", fundraiser_id: "nel", event_label: "Tulip", worked_on: null, worker_name: "Wes", hours: 4.25, amount_cents: 4250, destination: "fund", player_id: null, fund_id: "b4b", charge_id: null, note: null, created_at: "", voided_at: null },
    ],
  });
  const s = buildSnapshot(data, { fundraising: 4000, coachComps: 37500 });
  assert.deepEqual(s.moneyIn, { families: 60000, programs: 0, income: 200000, fundraising: 8250, total: 268250 });
  assert.equal(s.moneyOut, 303000);
  assert.equal(s.net, -34750);
  assert.deepEqual(s.teams, [{ name: "14u White", spend: { budget: 15000, paid: 10000 }, passedOn: 15000 }]);
  assert.deepEqual(s.events, [{ name: "MRS", spend: { budget: 240000, paid: 240000 }, income: 0, expected: 400000 }]);
  assert.deepEqual(s.funds, [{ name: "General program fund", total: 4250 }]);
  assert.deepEqual(s.fundraisers, [{ name: "Nelson's Produce", toFamilies: 4000, toFunds: 4250 }]);
  const csv = snapshotCsv(s);
  assert.match(csv, /^Section,Item,Budget,Actual,Note\r\n/);
  assert.match(csv, /Money in,Total,,2682\.50,/);
  assert.ok(!/Sarah|Wes/.test(csv), "no family names in the Snapshot");
});

test("the Treasurer's spreadsheet reads into costs, income, programs and shifts", async () => {
  const { parseFinanceWorkbook, monthOf, teamKey } = await import("../../lib/finances/import-sheet.ts");
  const plan = parseFinanceWorkbook(
    [
      {
        name: "Payables",
        rows: [
          [null, null, null, "Budgeted", "Paid"],
          [null, null, "Insurance", null, 530, "ck2165"],
          [null, "Cognito", "April", null, 2.13],
          [null, null, "May", null, 19],
          ["Spring", "Krave Workouts", null, null, 2140],
          ["Summer", "Summer Clinics", "Gym Rental", null, 2480],
          ["Practice Gym Rental", "St Marks", "October", 1100],
          [null, null, "Feburary/March", 925],
          [null, "UBT"],
          ["Teams", "10u Grey", "Conquerors League (Falls)", null, 525, "ck 2167"],
          [null, null, "Central Iowa HS Shootout", 150, 100, new Date(2026, 10, 9)],
          ["MRS", "MRS", "Court Rental", 2400],
          [null, null, "Total", "=SUM(D4:D137)"],
        ],
      },
      {
        name: "Receivables",
        rows: [
          [null, null, "Budgeted", "Recived"],
          ["Spring", "Krave Player Registratrion", null, 3040],
          ["Summer Clinic T-shirt", "Pat Doe", null, 15],
          [null, "Sam Roe", null, 12, null, 12],
          ["Donations", "Lanphier", null, 2000],
          ["MRS", "Registration", 4000],
        ],
      },
      { name: "Spring-Summer Workouts", rows: [[null, "SPRING"], ["Junior High"], [null, "Ann Lee", 60], ["High School"], [null, "Bo Kay", 100], [null, "SUMMER"], [null, "Bo Kay", 100]] },
      { name: "Summer Clinics", rows: [[null, "Owe", "Paid", null, "NP"], ["Cy Dee", null, 60], ["Ed Fox", null, null, null, 60]] },
      { name: "Nelson's Produce", rows: [[], [], ["Tulip Festival", "Gus Hill", 3, 30, null, "Registration"], [null, "Ivy Hill", 4.25, 42.25, null, "Buckets for Bucks"]] },
      { name: "Fundraising", rows: [[], [], ["Lanphier", 2000], ["Goforth", 64]] },
      { name: "Regular Season", rows: [["First", "Last", "DOB", "Age", "Jersey Ordered", "Shorts Ordered", "Class", "Registration Amount", "Amount Due", "PAID", "Date", "Nelson's"], ["Gus", "Hill", new Date(2014, 3, 24), 12, null, null, "8u-12u", 375, null, 375, null, 159.2], ["Jo", "Coach", null, 9, null, null, "8u-12u", "CK", null, "CK"]] },
    ],
    2026
  );
  assert.deepEqual(
    plan.lines.map((l) => [l.group, l.team ?? l.event ?? l.program ?? l.vendor ?? "", l.description, l.month, l.budget_cents, l.payment?.amount_cents ?? 0, l.payment?.reference ?? null]),
    [
      ["General", "", "Insurance", null, 0, 53000, "2165"],
      ["Subscriptions", "Cognito", "Cognito forms", "2026-04-01", 0, 213, null],
      ["Subscriptions", "Cognito", "Cognito forms", "2026-05-01", 0, 1900, null],
      ["Programs", "Spring Workouts", "Spring workouts at Krave", null, 0, 214000, null],
      ["Programs", "Summer Clinics", "Gym Rental", null, 0, 248000, null],
      ["Practice gyms", "St Marks", "Gym rent", "2026-10-01", 110000, 0, null],
      ["Practice gyms", "St Marks", "Gym rent", "2027-02-01", 92500, 0, null],
      ["Teams", "10u Grey", "Conquerors League (Falls)", null, 0, 52500, "2167"],
      ["Teams", "10u Grey", "Central Iowa HS Shootout", null, 15000, 10000, null],
      ["Events", "MRS", "Court Rental", null, 240000, 0, null],
    ]
  );
  assert.equal(plan.lines[8].payment?.paid_on, "2026-11-09");
  assert.deepEqual(
    plan.income.map((i) => [i.category, i.from_name, i.amount_cents, i.budget_cents]),
    [
      ["merch", "Pat Doe", 1500, null],
      ["merch", "Sam Roe", 0, 1200],
      ["donation", "Lanphier", 200000, null],
      ["event", null, 0, 400000],
      ["donation", "Goforth", 6400, null],
    ]
  );
  assert.ok(plan.notes.some((n) => /Krave/.test(n)));
  assert.deepEqual(
    plan.programs.map((p) => [p.name, p.levels, p.signups.map((s) => `${s.first} ${s.last} ${s.level} ${s.price_cents}${s.waived ? " NP" : ""}`)]),
    [
      ["Spring Workouts", [{ label: "Junior high", cents: 6000 }, { label: "High school", cents: 10000 }], ["Ann Lee Junior high 6000", "Bo Kay High school 10000"]],
      ["Summer Workouts", [{ label: "High school", cents: 10000 }], ["Bo Kay High school 10000"]],
      ["Summer Clinics", [{ label: "Everyone", cents: 6000 }], ["Cy Dee Everyone 6000", "Ed Fox Everyone 6000 NP"]],
    ]
  );
  assert.deepEqual(
    plan.shifts.map((s) => [s.event_label, s.worker_name, s.hours, s.amount_cents, s.destination]),
    [
      ["Tulip Festival", "Gus Hill", 3, 3000, "family"],
      ["Tulip Festival", "Ivy Hill", 4.25, 4225, "fund"],
    ]
  );
  assert.deepEqual(
    plan.players.map((p) => [p.first, p.comped, p.paid_cents, p.nelsons_cents, p.dob]),
    [
      ["Gus", false, 37500, 15920, "2014-04-24"],
      ["Jo", true, null, null, null],
    ]
  );
  assert.equal(monthOf("January", 2026), "2027-01-01");
  assert.equal(teamKey("14U - White"), teamKey("14u white"));
  assert.equal(teamKey("10u Gray"), teamKey("10U GREY"));
});

test("fundraising money goes to the player picked, then on down the family", async () => {
  const { familySpill, applySpill } = await import("../../lib/finances/club-logic.ts");
  const fb = {
    balance: new Map([
      ["luke", 2000],
      ["nate", 40000],
      ["solo", 0],
    ]),
    siblings: new Map([
      ["luke", ["luke", "nate"]],
      ["nate", ["luke", "nate"]],
      ["solo", ["solo"]],
    ]),
    names: new Map([
      ["luke", "Luke Wesner"],
      ["nate", "Nate Wesner"],
      ["solo", "Sam Solo"],
    ]),
  };
  // Sarah's $30 shift, 3 hours: Luke owes $20, so $10 goes to Nate.
  const pieces = familySpill(3000, 3, "luke", fb);
  assert.deepEqual(pieces, [
    { player_id: "luke", amount_cents: 2000, hours: 2 },
    { player_id: "nate", amount_cents: 1000, hours: 1 },
  ]);
  applySpill(fb, pieces);
  assert.equal(fb.balance.get("luke"), 0);
  assert.equal(fb.balance.get("nate"), 39000);
  // Luke's paid now: the next one all goes to Nate.
  assert.deepEqual(familySpill(4225, 4.25, "luke", fb), [{ player_id: "nate", amount_cents: 4225, hours: 4.25 }]);
  // No brothers, or nobody owing: it stays on the player picked.
  assert.deepEqual(familySpill(3000, 3, "solo", fb), [{ player_id: "solo", amount_cents: 3000, hours: 3 }]);
  // Odd hours still add up.
  const odd = familySpill(3420, 3.42, "luke", { ...fb, balance: new Map([["luke", 1000], ["nate", 99999]]) });
  assert.equal(Math.round(odd.reduce((n, p) => n + p.hours, 0) * 100) / 100, 3.42);
  assert.equal(odd.reduce((n, p) => n + p.amount_cents, 0), 3420);
});

test("balances against the sheet: families that differ, biggest first, credits spilled across brothers still add up", async () => {
  const { compareBalances } = await import("../../lib/finances/import-sheet.ts");
  const sp = (first: string, last: string, o: Partial<import("../../lib/finances/import-sheet.ts").SheetPlayer> = {}) => ({
    row: 1, first, last, dob: null, comped: false, fee_cents: 37500, paid_cents: 0, nelsons_cents: null, due_cents: 0, jersey: null, shorts: null, ...o,
  });
  const families = [
    [{ id: "luke", name: "Luke Wesner" }, { id: "nate", name: "Nate Wesner" }],
    [{ id: "ck", name: "Gideon Nelson" }],
    [{ id: "max", name: "Max Malone" }],
    [{ id: "new", name: "New Kid" }],
  ];
  const site = new Map([
    // Nelson's credit all on Luke; the family still owes the sheet's total.
    ["luke", { charged: 37500, credited: 50000, paid: 0 }],
    ["nate", { charged: 51000, credited: 0, paid: 24480 }],
    // CK still charged registration here.
    ["ck", { charged: 52500, credited: 0, paid: 0 }],
    ["max", { charged: 63500, credited: 0, paid: 63500 }],
    ["new", { charged: 40000, credited: 0, paid: 0 }],
  ]);
  const sheet = new Map([
    ["luke", sp("Luke", "Wesner", { paid_cents: 37500, nelsons_cents: 37500 })],
    ["nate", sp("Nate", "Wesner", { fee_cents: 40000, jersey: "YM", shorts: "YM", paid_cents: 37070, nelsons_cents: 37070, due_cents: 13930 })],
    ["ck", sp("Gideon", "Nelson", { comped: true, fee_cents: null })],
    ["max", sp("Max", "Malone", { fee_cents: 52500, paid_cents: 63500 })],
  ]);
  const out = compareBalances(families, site, sheet);
  // Wesner: 885 − 500 − 244.80 = 140.20 here against 139.30 on the sheet.
  assert.deepEqual(out.families.map((f) => [f.names, f.site, f.sheet]), [
    ["Gideon Nelson", 52500, 0],
    ["New Kid", 40000, 0],
    ["Luke Wesner, Nate Wesner", 14020, 13930],
  ]);
  assert.equal(out.families[1].players[0].sheet, null);
  assert.equal(out.families[0].players[0].sheet?.comped, true);
  assert.equal(out.siteOwed, 52500 + 40000 + 14020);
  assert.equal(out.sheetDue, 13930);
});

test("uniform charges: a plain Uniform covers both pieces, and the import's extras are the duplicates", async () => {
  const { uniformPiecesOf, duplicateUniformCharges, IMPORT_NOTE } = await import("../../lib/finances/import-sheet.ts");
  assert.deepEqual(uniformPiecesOf("Jersey (AM)"), ["Jersey"]);
  assert.deepEqual(uniformPiecesOf("Shorts (YM)"), ["Shorts"]);
  assert.deepEqual(uniformPiecesOf("Uniform"), ["Jersey", "Shorts"]);
  assert.deepEqual(uniformPiecesOf(null), ["Jersey", "Shorts"]);
  const c = (id: string, player_id: string, description: string, note: string | null = IMPORT_NOTE) => ({ id, player_id, description, amount_cents: 5500, note });
  const out = duplicateUniformCharges([
    // Jasper: $110 "Uniform" by hand, then the import's jersey and shorts.
    c("own", "jasper", "Uniform", null),
    c("j1", "jasper", "Jersey (YS)"),
    c("s1", "jasper", "Shorts (YS)"),
    // Max: only the import's. Nothing to remove.
    c("j2", "max", "Jersey (AM)"),
    c("s2", "max", "Shorts (AM)"),
    // Jett: his own jersey; the import's shorts are new.
    c("own2", "jett", "Jersey", null),
    c("j3", "jett", "Jersey (YM)"),
    c("s3", "jett", "Shorts (YM)"),
  ]);
  assert.deepEqual(out.map((x) => x.id), ["j1", "s1", "j3"]);
});

