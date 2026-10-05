// Venmo import (lib/finances/venmo-match.ts): tying the Gmail Venmo export to
// players and their fees, and what lands on the exceptions sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchVenmo, normName, venmoDate, type MatchPlayer, type VenmoRow } from "../../lib/finances/venmo-match.ts";

const players: MatchPlayer[] = [
  { id: "max", full_name: "Max Malone", team: "16U Blue", fee_cents: 52500, parent_ids: ["jeff"], parent_names: ["Jeff Malone"] },
  { id: "micah", full_name: "Micah Goeller", team: "12U", fee_cents: 37500, parent_ids: ["cat"], parent_names: ["Catherine Goeller"] },
  { id: "eli", full_name: "Eli Goeller", team: "14U", fee_cents: 40000, parent_ids: ["cat"], parent_names: ["Catherine Goeller"] },
  { id: "theo", full_name: "Theo Lanphier", team: "14U", fee_cents: 40000, parent_ids: [], parent_names: [] },
  { id: "ann", full_name: "Ann Smith", team: "12U", fee_cents: 37500, parent_ids: ["s1"], parent_names: ["Pat Smith"] },
  { id: "bo", full_name: "Bo Smith", team: "12U", fee_cents: 37500, parent_ids: ["s2"], parent_names: ["Lee Smith"] },
];

let n = 1;
function venmo(from: string, amount: string, about: string, date = "2026-09-20 10:00 AM CT", type = "received"): VenmoRow {
  n++;
  return { row: n, type, from, amount, about, date, messageId: `m${n}` };
}

test("helpers", () => {
  assert.equal(venmoDate("2026-10-05 08:36 AM CT"), "2026-10-05");
  assert.equal(venmoDate(null), null);
  assert.equal(normName("  Zoë O'Brien-Smith "), "zoe obrien smith");
});

test("a parent's Venmo for one kid's fee is applied with the note", () => {
  const r = matchVenmo([venmo("Jeff Malone", "$525.00", "Max Malone 26-27 season", "2026-10-05 08:36 AM CT")], players, [], []);
  assert.equal(r.applied.length, 1);
  const a = r.applied[0];
  assert.equal(a.paid_on, "2026-10-05");
  assert.deepEqual(a.splits, [{ player_id: "max", amount_cents: 52500 }]);
  assert.equal(a.note, 'Venmo from Jeff Malone: "Max Malone 26-27 season"');
  assert.match(a.reference, /^Venmo m\d+$/);
});

test("one Venmo for two kids splits by fee; a fee for one kid picks that kid", () => {
  const both = matchVenmo([venmo("Catherine Goeller", "$775.00", "Basketball")], players, [], []);
  assert.deepEqual(
    both.applied[0].splits.sort((x, y) => x.player_id.localeCompare(y.player_id)),
    [
      { player_id: "eli", amount_cents: 40000 },
      { player_id: "micah", amount_cents: 37500 },
    ]
  );
  const one = matchVenmo([venmo("Catherine Goeller", "$400.00", "Bball")], players, [], []);
  assert.deepEqual(one.applied[0].splits, [{ player_id: "eli", amount_cents: 40000 }]);
});

test("a payer not on file matches by a player named in the note", () => {
  const r = matchVenmo([venmo("Emily Lanphier", "$400.00", "Theo Lanphier")], players, [], []);
  assert.deepEqual(r.applied[0].splits, [{ player_id: "theo", amount_cents: 40000 }]);
});

test("exceptions: wrong amount, unknown payer, shared last name, before the season", () => {
  const r = matchVenmo(
    [
      venmo("Jeff Malone", "$10.00", "Game"),
      venmo("Nobody Known", "$375.00", "Basketball"),
      venmo("Chris Smith", "$375.00", "Bball"),
      venmo("Jeff Malone", "$525.00", "Max", "2026-01-03 10:00 AM CT"),
    ],
    players,
    [],
    [],
    { since: "2026-06-01" }
  );
  assert.equal(r.applied.length, 0);
  assert.deepEqual(
    r.exceptions.map((e) => e.reason),
    [
      "Before 2026-06-01, when this season's registrations started",
      "The amount doesn't match what the family owes",
      "No player or parent on file matches the payer or the note",
      "No player named, and more than one family has the payer's last name",
    ]
  );
  assert.match(r.exceptions[1].candidates, /Max Malone \(16U Blue\): owes \$525\.00/);
});

test("already paid by hand, or already imported, isn't applied twice", () => {
  const row = venmo("Jeff Malone", "$525.00", "Max");
  const byHand = matchVenmo([row], players, [], [
    { player_id: "max", amount_cents: 52500, paid_on: "2026-09-20", reference: null, voided_at: null },
  ]);
  assert.equal(byHand.applied.length, 0);
  assert.match(byHand.exceptions[0].reason, /already recorded by hand/);

  const again = matchVenmo([row], players, [], [
    { player_id: "max", amount_cents: 52500, paid_on: "2026-09-20", reference: `Venmo ${row.messageId}`, voided_at: null },
  ]);
  assert.equal(again.alreadyImported.length, 1);
  assert.equal(again.exceptions.length, 0);
});

test("a second Venmo in the same run sees the first; balances follow charges", () => {
  const twice = matchVenmo([venmo("Jeff Malone", "$525.00", "Max"), venmo("Jeff Malone", "$525.00", "Max")], players, [], []);
  assert.equal(twice.applied.length, 1);
  assert.equal(twice.exceptions.length, 1);

  // Uniform charged on top of the fee: the balance is what matches.
  const r = matchVenmo([venmo("Jeff Malone", "$635.00", "Max high school/uniforms")], players, [
    { player_id: "max", kind: "charge", amount_cents: 52500, voided_at: null },
    { player_id: "max", kind: "charge", amount_cents: 11000, voided_at: null },
  ], []);
  assert.deepEqual(r.applied[0].splits, [{ player_id: "max", amount_cents: 63500 }]);
});

test("transfers and payments out aren't payments", () => {
  const r = matchVenmo([venmo("", "$695.00", "Standard transfer", undefined, "transfer_to_bank")], players, [], []);
  assert.equal(r.notPayments.length, 1);
  assert.equal(r.exceptions.length, 0);
});
