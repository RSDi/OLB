// Payments (lib/finances/logic.ts): registration fees from a registration's
// answer, families, balances, splitting a family's payment, input clean-up
// and the spreadsheet export.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  balanceLabel,
  buildAccounts,
  groupPayments,
  sumTotals,
  balanceState,
  cleanChargeInput,
  cleanPaymentInput,
  familyName,
  groupFamilies,
  ledgerCsv,
  registrationFeeCents,
  registrationTier,
  splitPayment,
  totalsFor,
  type ChargeInput,
} from "../../lib/finances/logic.ts";
import type { Charge, Payment, PaymentsPlayer } from "../../lib/finances/types.ts";

test("registration fee from the form's tier, or Cognito's bare tier", () => {
  assert.equal(registrationFeeCents("8u-12u - $375.00"), 37500);
  assert.equal(registrationFeeCents("14u - $400.00"), 40000);
  assert.equal(registrationFeeCents("16u-18u - $525.00"), 52500);
  assert.equal(registrationFeeCents("16u-18u"), 52500);
  assert.equal(registrationFeeCents("14U"), 40000);
  assert.equal(registrationFeeCents("Fee: $1,200"), 120000);
  assert.equal(registrationFeeCents(""), null);
  assert.equal(registrationFeeCents(null), null);
  assert.equal(registrationFeeCents("Waitlist"), null);
  assert.equal(registrationTier("16u-18u - $525.00"), "16u-18u");
  assert.equal(registrationTier("8u-12u"), "8u-12u");
});

test("siblings who share a parent are one family; blended families join up", () => {
  const players = [
    { id: "a1", full_name: "Micah Goeller", parent_ids: ["dad", "mom"] },
    { id: "b1", full_name: "Tim Ireland", parent_ids: ["bob"] },
    { id: "a2", full_name: "Colton Goeller", parent_ids: ["mom"] },
    { id: "c1", full_name: "Step Kid", parent_ids: ["dad", "stepmom"] },
    { id: "d1", full_name: "No Parents", parent_ids: [] },
  ];
  const families = groupFamilies(players).map((f) => f.map((p) => p.id));
  assert.deepEqual(families, [["a1", "a2", "c1"], ["b1"], ["d1"]]);
});

test("family names come from the kids' last names", () => {
  assert.equal(familyName([{ full_name: "Micah Goeller" }, { full_name: "Beau Goeller" }]), "Goeller");
  assert.equal(familyName([{ full_name: "Caleb Van Schooneveld" }]), "Van Schooneveld");
  assert.equal(familyName([{ full_name: "Amy Smith" }, { full_name: "Joe Jones" }]), "Smith / Jones");
});

test("totals skip voided entries and other families' players", () => {
  const charges = [
    { player_id: "a", kind: "charge" as const, amount_cents: 37500, voided_at: null },
    { player_id: "b", kind: "charge" as const, amount_cents: 40000, voided_at: null },
    { player_id: "a", kind: "charge" as const, amount_cents: 11000, voided_at: "2026-10-01T00:00:00Z" },
    { player_id: "b", kind: "credit" as const, amount_cents: 10000, voided_at: null },
    { player_id: "z", kind: "charge" as const, amount_cents: 99900, voided_at: null },
  ];
  const payments = [
    { player_id: "a", amount_cents: 37500, voided_at: null },
    { player_id: "b", amount_cents: 5000, voided_at: null },
    { player_id: "b", amount_cents: 5000, voided_at: "2026-10-02T00:00:00Z" },
  ];
  const t = totalsFor(["a", "b"], charges, payments);
  assert.deepEqual(t, { charged: 77500, credited: 10000, paid: 42500, balance: 25000 });
  assert.equal(balanceState(t), "owes");
  assert.equal(balanceLabel(t), "Owes $250.00");
});

test("balance states", () => {
  assert.equal(balanceState({ charged: 0, credited: 0, paid: 0, balance: 0 }), "none");
  assert.equal(balanceState({ charged: 100, credited: 0, paid: 100, balance: 0 }), "paid");
  assert.equal(balanceState({ charged: 100, credited: 100, paid: 0, balance: 0 }), "paid");
  assert.equal(balanceState({ charged: 100, credited: 0, paid: 150, balance: -50 }), "credit");
  assert.equal(balanceLabel({ charged: 100, credited: 0, paid: 150, balance: -50 }), "Credit $0.50");
});

test("a family payment pays each kid off in order, extra goes on the first", () => {
  const owed = [
    { player_id: "micah", balance: 37500 },
    { player_id: "colton", balance: 37500 },
    { player_id: "beau", balance: 40000 },
  ];
  assert.deepEqual(splitPayment(115000, owed), [
    { player_id: "micah", amount_cents: 37500 },
    { player_id: "colton", amount_cents: 37500 },
    { player_id: "beau", amount_cents: 40000 },
  ]);
  // Part payment: fills the first kids first.
  assert.deepEqual(splitPayment(50000, owed), [
    { player_id: "micah", amount_cents: 37500 },
    { player_id: "colton", amount_cents: 12500 },
  ]);
  // Overpayment: the extra is a credit on the first kid.
  assert.deepEqual(splitPayment(120000, owed), [
    { player_id: "micah", amount_cents: 42500 },
    { player_id: "colton", amount_cents: 37500 },
    { player_id: "beau", amount_cents: 40000 },
  ]);
  // Someone already paid up gets nothing; nobody owing → all on the first.
  assert.deepEqual(splitPayment(1000, [{ player_id: "x", balance: 0 }, { player_id: "y", balance: 500 }]), [
    { player_id: "x", amount_cents: 500 },
    { player_id: "y", amount_cents: 500 },
  ]);
  assert.deepEqual(splitPayment(0, owed), []);
  assert.deepEqual(splitPayment(500, []), []);
});

const charge: ChargeInput = {
  player_ids: ["p1", "p2", "p1"],
  kind: "charge",
  category: "uniform",
  description: "  ",
  amount: "$110",
  entry_date: "2026-10-01",
  note: "",
};

test("charge input: cleaned, deduped, described by its category", () => {
  assert.deepEqual(cleanChargeInput(charge), {
    player_ids: ["p1", "p2"],
    kind: "charge",
    category: "uniform",
    description: "Uniform",
    amount_cents: 11000,
    entry_date: "2026-10-01",
    note: null,
  });
  const credit = cleanChargeInput({ ...charge, kind: "credit", category: "covered", description: "Board vote Oct 5", amount: "375.00" });
  assert.ok(!("error" in credit));
  assert.equal(credit.description, "Board vote Oct 5");
  assert.equal(credit.amount_cents, 37500);
});

test("charge input: refuses what the database would", () => {
  assert.ok("error" in cleanChargeInput({ ...charge, player_ids: [] }));
  assert.ok("error" in cleanChargeInput({ ...charge, amount: "0" }));
  assert.ok("error" in cleanChargeInput({ ...charge, amount: "ten" }));
  assert.ok("error" in cleanChargeInput({ ...charge, entry_date: "Oct 1" }));
  // A credit category on a charge, and the other way round.
  assert.ok("error" in cleanChargeInput({ ...charge, category: "covered" }));
  assert.ok("error" in cleanChargeInput({ ...charge, kind: "credit", category: "uniform" }));
});

test("payment input: merges a player's shares and drops zero ones", () => {
  const r = cleanPaymentInput({
    splits: [
      { player_id: "a", amount_cents: 20000 },
      { player_id: "b", amount_cents: 0 },
      { player_id: "a", amount_cents: 5000 },
    ],
    paid_on: "2026-09-30",
    method: "venmo",
    reference: "  ",
    note: "Sept Venmo",
  });
  assert.deepEqual(r, {
    splits: [{ player_id: "a", amount_cents: 25000 }],
    paid_on: "2026-09-30",
    method: "venmo",
    reference: null,
    note: "Sept Venmo",
  });
  assert.ok("error" in cleanPaymentInput({ splits: [], paid_on: "2026-09-30", method: "venmo", reference: "", note: "" }));
  assert.ok("error" in cleanPaymentInput({ splits: [{ player_id: "a", amount_cents: 100 }], paid_on: "2026-09-30", method: "bitcoin", reference: "", note: "" }));
  assert.ok("error" in cleanPaymentInput({ splits: [{ player_id: "a", amount_cents: 1.5 }], paid_on: "2026-09-30", method: "cash", reference: "", note: "" }));
});

test("the spreadsheet export quotes commas and quotes", () => {
  const csv = ledgerCsv([
    { date: "2026-09-30", family: "Goeller", player: "Micah Goeller", type: "Payment", what: "Venmo", method: "Venmo", reference: "", amount_cents: -37500, note: 'Said "thanks", paid' },
  ]);
  assert.equal(
    csv,
    'Date,Family,Player,Type,What,Method,Reference,Amount,Note\r\n2026-09-30,Goeller,Micah Goeller,Payment,Venmo,Venmo,,-375.00,"Said ""thanks"", paid"\r\n'
  );
});

function player(id: string, full_name: string, parentIds: string[]): PaymentsPlayer {
  return {
    id,
    full_name,
    age_group: null,
    registration_fee: null,
    payment_method: null,
    registered_at: null,
    team: null,
    parents: parentIds.map((pid) => ({
      relationship: "mother" as const,
      member: { id: pid, full_name: `Parent ${pid}`, email: null, phone: null },
    })),
  };
}

function chargeRow(id: string, player_id: string, cents: number, kind: "charge" | "credit" = "charge"): Charge {
  return {
    id, player_id, kind, category: kind === "credit" ? "covered" : "registration", description: "x",
    amount_cents: cents, entry_date: "2026-09-01", note: null, created_by: null, created_at: "", voided_at: null,
  };
}

function paymentRow(id: string, group_id: string, player_id: string, cents: number, paid_on = "2026-09-10"): Payment {
  return {
    id, group_id, player_id, amount_cents: cents, paid_on, method: "venmo", reference: null, note: null,
    recorded_by: null, created_at: "", voided_at: null,
  };
}

test("accounts: families with their entries, totals per family and per kid", () => {
  const players = [
    player("beau", "Beau Goeller", ["jason", "catherine"]),
    player("tim", "Tim Ireland", ["bob"]),
    player("micah", "Micah Goeller", ["catherine"]),
  ];
  const charges = [chargeRow("c1", "beau", 40000), chargeRow("c2", "micah", 37500), chargeRow("c3", "tim", 52500), chargeRow("c4", "tim", 52500, "credit")];
  const payments = [paymentRow("p1", "g1", "beau", 40000), paymentRow("p2", "g1", "micah", 10000)];
  const accounts = buildAccounts(players, charges, payments);
  assert.deepEqual(accounts.map((a) => [a.name, a.players.map((p) => p.id)]), [
    ["Goeller", ["beau", "micah"]],
    ["Ireland", ["tim"]],
  ]);
  const [goeller, ireland] = accounts;
  assert.deepEqual(goeller.totals, { charged: 77500, credited: 0, paid: 50000, balance: 27500 });
  assert.equal(goeller.byPlayer.get("micah")!.balance, 27500);
  assert.equal(goeller.parents.length, 2);
  assert.equal(ireland.totals.balance, 0);
  assert.equal(balanceState(ireland.totals), "paid");
  assert.deepEqual(sumTotals(accounts), { charged: 130000, credited: 52500, paid: 50000, balance: 27500 });
});

test("payment groups: one Venmo across kids, newest first", () => {
  const groups = groupPayments([
    paymentRow("p1", "g1", "beau", 40000, "2026-09-10"),
    paymentRow("p2", "g1", "micah", 10000, "2026-09-10"),
    paymentRow("p3", "g2", "micah", 27500, "2026-10-01"),
  ]);
  assert.deepEqual(groups.map((g) => [g.group_id, g.amount_cents, g.splits.length]), [
    ["g2", 27500, 1],
    ["g1", 50000, 2],
  ]);
});
