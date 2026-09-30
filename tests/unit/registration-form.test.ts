// The public registration form (lib/teams/registration-form.ts): fee tiers
// from a birthday, names and volunteer answers from what's on file, filling
// in a returning family, and what's still missing before it can be sent. And
// the emailed codes (lib/teams/registration-codes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEE_TIERS,
  emptyRegistration,
  fromPrefill,
  isHighSchoolTier,
  joinNames,
  newKid,
  registrationProblem,
  splitInterests,
  splitName,
  suggestedTier,
  tierParts,
  toInputs,
  type FamilyPrefill,
  type RegistrationState,
} from "../../lib/teams/registration-form.ts";
import { checkCode, hashCode, newCode } from "../../lib/teams/registration-codes.ts";

test("the fee tier follows age on August 1, 2026", () => {
  assert.equal(suggestedTier("2014-08-01"), FEE_TIERS[0]); // turns 12 that day
  assert.equal(suggestedTier("2013-08-02"), FEE_TIERS[0]); // still 12, turns 13 the day after
  assert.equal(suggestedTier("2013-08-01"), FEE_TIERS[1]); // 13
  assert.equal(suggestedTier("2011-08-02"), FEE_TIERS[1]); // still 14
  assert.equal(suggestedTier("2011-08-01"), FEE_TIERS[2]); // 15: high school
  assert.equal(suggestedTier("2010-11-15"), FEE_TIERS[2]);
  assert.equal(suggestedTier(""), null);
  assert.ok(isHighSchoolTier(FEE_TIERS[2]));
  assert.ok(!isHighSchoolTier(FEE_TIERS[1]));
  assert.deepEqual(tierParts(FEE_TIERS[1]), { label: "14u", dollars: 400 });
  assert.deepEqual(tierParts(FEE_TIERS[0]), { label: "8u–12u", dollars: 375 });
});

test("names read naturally", () => {
  assert.equal(joinNames(["Sam"]), "Sam");
  assert.equal(joinNames(["Sam", "Evan"]), "Sam and Evan");
  assert.equal(joinNames(["Sam", "Evan", "Leo"]), "Sam, Evan and Leo");
  assert.deepEqual(splitName("Mary Ann Smith"), ["Mary Ann", "Smith"]);
  assert.deepEqual(splitName("  Cher "), ["Cher", ""]);
  assert.deepEqual(splitName(null), ["", ""]);
});

test("saved volunteer answers go back into the checkboxes", () => {
  const options = ["Coach/ Assistant Coach", "Team Parent (1 per Team)", "Fundraising"];
  assert.deepEqual(splitInterests("Coach/ Assistant Coach, Fundraising, Snacks", options), {
    picked: ["Coach/ Assistant Coach", "Fundraising"],
    other: "Snacks",
  });
  assert.deepEqual(splitInterests(null, options), { picked: [], other: "" });
});

const family: FamilyPrefill = {
  firstName: "Jamie",
  relationship: "mother",
  players: [
    {
      key: "p1", first: "Sam", last: "Carter", dob: "2016-04-19", phone: "", email: "", registeredThisSeason: false, directoryOptin: false,
      address: { line1: "100 Maple St", line2: "", city: "Omaha", state: "NE", zip: "68104" },
      father: { first: "Chris", last: "Carter", email: "chris@example.com", phone: "402", volunteer: ["Fundraising"], volunteer_other: "" },
      mother: { first: "Jamie", last: "Carter", email: "jamie@example.com", phone: "531", volunteer: [], volunteer_other: "" },
    },
    {
      key: "p2", first: "Ava", last: "Carter", dob: "2010-03-01", phone: "", email: "ava@example.com", registeredThisSeason: true, directoryOptin: false,
      address: { line1: "100 Maple St", line2: "", city: "Omaha", state: "NE", zip: "68104" },
      father: null, mother: null,
    },
  ],
};

test("a returning family is filled in from what's on file", () => {
  const s = fromPrefill(family, ["p1", "p2"], [newKid({ athlete_first: "Leo", athlete_last: "Carter", athlete_dob: "2019-01-01" })]);
  assert.deepEqual(s.kids.map((k) => [k.athlete_first, k.first_season, k.fee_tier]), [
    ["Sam", false, FEE_TIERS[0]],
    ["Ava", false, FEE_TIERS[2]],
    ["Leo", null, FEE_TIERS[0]],
  ]);
  assert.equal(s.kids[1].athlete_email, "ava@example.com");
  assert.equal(s.family.address_line1, "100 Maple St");
  assert.equal(s.family.father_first, "Chris");
  assert.deepEqual(s.family.father_volunteer, ["Fundraising"]);
  assert.equal(s.family.mother_email, "jamie@example.com");
  assert.equal(s.family.directory_optin, false);
});

function complete(): RegistrationState {
  const s = fromPrefill(family, ["p1"], []);
  s.kids[0] = { ...s.kids[0], homeschool_affirm: true, needs_uniform: false };
  s.family = { ...s.family, waiver_agreed: true, printed_name: "Jamie Carter", signature_mode: "type", signature_name: "Jamie Carter", payment_option: "Venmo" };
  return s;
}

test("nothing is sent until every question is answered", () => {
  assert.equal(registrationProblem(complete()), null);
  assert.match(registrationProblem(emptyRegistration()) ?? "", /name/);
  const noUniform = complete();
  noUniform.kids[0].needs_uniform = null;
  assert.match(registrationProblem(noUniform) ?? "", /uniform/);
  const twoKids = complete();
  twoKids.kids.push(newKid({ athlete_first: "Leo", athlete_last: "Carter", athlete_dob: "2019-01-01", fee_tier: FEE_TIERS[0], needs_uniform: true }));
  assert.match(registrationProblem(twoKids) ?? "", /^Leo: .*homeschool/);
  const unsigned = complete();
  unsigned.family.signature_name = "";
  assert.match(registrationProblem(unsigned) ?? "", /sign/i);
});

test("each player is sent with the family's answers", () => {
  const s = complete();
  s.kids.push(newKid({ athlete_first: "Leo", athlete_last: "Carter", athlete_dob: "", fee_tier: FEE_TIERS[0] }));
  const rows = toInputs(s, "2026-09-30");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].athlete_first, "Sam");
  assert.equal(rows[1].athlete_dob, null);
  assert.equal(rows[1].address_line1, "100 Maple St");
  assert.equal(rows[0].signature_date, "2026-09-30");
  assert.equal(rows[0].donation_interest, false);
  assert.ok(!("key" in rows[0]));
});

test("a code matches only its own hash, before it expires and within its tries", () => {
  const code = newCode();
  assert.match(code, /^\d{6}$/);
  const row = { id: "row-1", code_hash: hashCode("row-1", code), attempts: 0, expires_at: new Date(Date.now() + 60_000).toISOString(), verified_at: null };
  assert.equal(checkCode(row, code), "ok");
  assert.equal(checkCode(row, `${code.slice(0, 3)} ${code.slice(3)}`), "ok");
  assert.equal(checkCode(row, code === "000000" ? "111111" : "000000"), "wrong");
  assert.equal(checkCode({ ...row, code_hash: hashCode("row-2", code) }, code), "wrong");
  assert.equal(checkCode({ ...row, attempts: 5 }, code), "locked");
  assert.equal(checkCode({ ...row, expires_at: new Date(Date.now() - 1).toISOString() }, code), "expired");
  assert.equal(checkCode({ ...row, verified_at: new Date().toISOString() }, code), "expired");
  assert.equal(checkCode(null, code), "expired");
});
