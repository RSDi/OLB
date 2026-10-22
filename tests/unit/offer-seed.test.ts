// Offer-link prefill: the waitlist/assessment row → seed, the registration
// it fills in, Mom/Dad applying the parent, and the steps an offered family
// still has to answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { offerSeedFromRow } from "../../lib/onboarding/offer-seed.ts";
import { WORKFLOW_EMAILS } from "../../lib/onboarding/email-text.ts";
import {
  EMPTY_FAMILY,
  FEE_TIERS,
  applyOfferParent,
  fromOfferSeed,
} from "../../lib/teams/registration-form.ts";
import { buildRegistrationSteps } from "../../lib/teams/registration-steps.ts";

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 32 chars; tests never print a real offer token

test("an offer seed carries the parent, phone, homeschool context and notes", () => {
  const seed = offerSeedFromRow(TOKEN, "2026-10-29T05:00:00.000Z", {
    first_name: "Sam",
    last_name: "Carter",
    dob: "2012-04-19",
    parent_email: "jeff+OLBTest@malone.net",
    parent_name: "Jeff Malone",
    parent_phone: "4025550100",
    extra: { intake: { homeschooled: true, notes: "Played rec last year." } },
  });
  assert.equal(seed.first, "Sam");
  assert.equal(seed.last, "Carter");
  assert.equal(seed.dob, "2012-04-19");
  assert.equal(seed.email, "jeff+OLBTest@malone.net");
  assert.equal(seed.parentFirst, "Jeff");
  assert.equal(seed.parentLast, "Malone");
  assert.equal(seed.parentName, "Jeff Malone");
  assert.equal(seed.phone, "4025550100");
  assert.equal(seed.homeschooled, true);
  assert.equal(seed.notes, "Played rec last year.");
  assert.ok(seed.expires);
});

test("a missing parent name still gives empty first/last, not a crash", () => {
  const seed = offerSeedFromRow(TOKEN, "2026-10-29T05:00:00.000Z", {
    first_name: "Sam",
    last_name: "Carter",
    dob: null,
    parent_email: null,
    parent_name: null,
    parent_phone: null,
    extra: null,
  });
  assert.equal(seed.parentFirst, "");
  assert.equal(seed.parentLast, "");
  assert.equal(seed.homeschooled, null);
  assert.equal(seed.notes, null);
});

test("fromOfferSeed fills the player and parent fallback, not NCHC or commitments", () => {
  const seed = offerSeedFromRow(TOKEN, "2026-10-29T05:00:00.000Z", {
    first_name: "Sam",
    last_name: "Carter",
    dob: "2012-04-19",
    parent_email: "jeff+OLBTest@malone.net",
    parent_name: "Jeff Malone",
    parent_phone: "4025550100",
    extra: { intake: { homeschooled: true, notes: "Football Tue/Thu." } },
  });
  const st = fromOfferSeed(seed);
  assert.equal(st.kids[0].athlete_first, "Sam");
  assert.equal(st.kids[0].athlete_last, "Carter");
  assert.equal(st.kids[0].athlete_dob, "2012-04-19");
  assert.equal(st.kids[0].first_season, true);
  assert.equal(st.kids[0].fee_tier, FEE_TIERS[1]); // 14u
  assert.equal(st.kids[0].homeschool_affirm, null);
  assert.equal(st.family.father_first, "Jeff");
  assert.equal(st.family.father_last, "Malone");
  assert.equal(st.family.father_email, "jeff+OLBTest@malone.net");
  assert.equal(st.family.father_phone, "4025550100");
  assert.equal(st.family.mother_first, "");
  assert.equal(st.family.commitments_has, null);
  assert.equal(st.family.commitments_note, "");
  assert.notEqual(st.family.commitments_note, seed.notes);
});

test("picking Mom moves the offer parent off the father fallback", () => {
  const seeded = fromOfferSeed({
    first: "Sam",
    last: "Carter",
    dob: "2012-04-19",
    email: "jeff+OLBTest@malone.net",
    parentFirst: "Jeff",
    parentLast: "Malone",
    phone: "4025550100",
  });
  const afterMom = applyOfferParent(seeded.family, "mother", {
    parentFirst: "Jeff",
    parentLast: "Malone",
    email: "jeff+OLBTest@malone.net",
    phone: "4025550100",
  });
  assert.equal(afterMom.mother_first, "Jeff");
  assert.equal(afterMom.mother_last, "Malone");
  assert.equal(afterMom.mother_email, "jeff+OLBTest@malone.net");
  assert.equal(afterMom.mother_phone, "4025550100");
  assert.equal(afterMom.father_first, "");
  assert.equal(afterMom.father_email, "");
});

test("picking Dad keeps the father fallback", () => {
  const seeded = fromOfferSeed({
    first: "Sam",
    last: "Carter",
    dob: "2012-04-19",
    email: "a@example.com",
    parentFirst: "Chris",
    parentLast: "Carter",
    phone: "402",
  });
  const afterDad = applyOfferParent(seeded.family, "father", {
    parentFirst: "Chris",
    parentLast: "Carter",
    email: "a@example.com",
    phone: "402",
  });
  assert.equal(afterDad.father_first, "Chris");
  assert.equal(afterDad.father_email, "a@example.com");
  assert.equal(afterDad.mother_first, "");
});

test("an offered family is only asked the remaining steps", () => {
  const st = fromOfferSeed({
    first: "Sam",
    last: "Carter",
    dob: "2012-04-19",
    email: "a@example.com",
    parentFirst: "Jamie",
    parentLast: "Carter",
    phone: "531",
  });
  const steps = buildRegistrationSteps("new", st, new Set(), null, { offerSeeded: true });
  assert.equal(steps.some((s) => s.startsWith("name:")), false);
  assert.equal(steps.some((s) => s.startsWith("dob:")), false);
  assert.equal(steps.some((s) => s.startsWith("first:")), false);
  assert.equal(steps.includes("more"), false);
  assert.equal(steps.includes("you-details"), false);
  assert.equal(steps.includes("other-parent"), false);
  assert.equal(steps.includes("fees"), false);
  assert.deepEqual(
    steps.filter((s) =>
      ["home", "contact", "you", "uniform", "homeschool", "commitments", "help-father", "directory", "waiver", "donation", "payment", "summary"].includes(s)
    ),
    ["home", "contact", "you", "uniform", "homeschool", "commitments", "help-father", "directory", "waiver", "donation", "payment", "summary"]
  );
});

test("a new family without an offer still gets the full step list", () => {
  const st = { kids: fromOfferSeed({ first: "", last: "", dob: null, email: null, parentFirst: "", parentLast: "", phone: null }).kids, family: { ...EMPTY_FAMILY } };
  st.kids[0] = { ...st.kids[0], athlete_first: "", athlete_last: "", athlete_dob: "", first_season: null, fee_tier: "" };
  const steps = buildRegistrationSteps("new", st, new Set(), null);
  assert.ok(steps.some((s) => s.startsWith("name:")));
  assert.ok(steps.includes("you-details"));
  assert.ok(steps.includes("other-parent"));
  assert.ok(steps.includes("fees"));
});

test("the Spot offer default says what is actually prefilled", () => {
  const offer = WORKFLOW_EMAILS.find((e) => e.key === "offer")!;
  assert.match(offer.body, /filled in \{player\}'s name, birthday and your contact info/i);
  assert.match(offer.body, /address, waiver and uniform/i);
  assert.doesNotMatch(offer.body, /most of the form is already filled in/i);
});
