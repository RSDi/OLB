// Commitments step on the real registration form: step order, exact copy,
// Yes/No branching, extra.commitments shape, and the admin flag. Fixtures
// only — no live Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMMITMENTS_ASK,
  COMMITMENTS_FLAG,
  COMMITMENTS_NOTE_LABEL,
  COMMITMENTS_YES_FOLLOW_UP,
  commitmentsAdmin,
  commitmentsProblem,
  commitmentsSteps,
  extraCommitments,
  renderCommitmentsAdmin,
} from "../../lib/teams/registration-commitments.ts";
import { buildRegistrationSteps } from "../../lib/teams/registration-steps.ts";
import {
  emptyRegistration,
  fromPrefill,
  newKid,
  registrationProblem,
  toInputs,
  type FamilyPrefill,
  type RegistrationState,
} from "../../lib/teams/registration-form.ts";
import { FEE_TIERS } from "../../lib/teams/registration-form.ts";

const root = join(import.meta.dirname, "../..");
function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const ASK =
  "Does your player have any other commitments this season, like football, debate, another sport or activity, that might pull them away from practices or games? We ask because consistent attendance matters to the whole team.";
const YES_FOLLOW_UP =
  "Thanks for letting us know! A coach or board member will review this and reach out to learn more. Is there anything you already know about your schedule that would help us work through it together?";
const NOTE_LABEL = "Activity name and conflicting days/times (optional)";

const family: FamilyPrefill = {
  firstName: "Jamie",
  relationship: "mother",
  players: [
    {
      key: "p1",
      first: "Sam",
      last: "Carter",
      dob: "2016-04-19",
      phone: "",
      email: "",
      registeredThisSeason: false,
      directoryOptin: false,
      address: { line1: "100 Maple St", line2: "", city: "Omaha", state: "NE", zip: "68104" },
      father: { first: "Chris", last: "Carter", email: "chris@example.com", phone: "402", volunteer: [], volunteer_other: "" },
      mother: { first: "Jamie", last: "Carter", email: "jamie@example.com", phone: "531", volunteer: [], volunteer_other: "" },
    },
  ],
};

function filled(patch: Partial<RegistrationState["family"]> = {}): RegistrationState {
  const s = fromPrefill(family, ["p1"], []);
  s.kids[0] = { ...s.kids[0], homeschool_affirm: true, needs_uniform: false };
  s.family = {
    ...s.family,
    waiver_agreed: true,
    printed_name: "Jamie Carter",
    signature_mode: "type",
    signature_name: "Jamie Carter",
    payment_option: "Venmo",
    commitments_has: false,
    ...patch,
  };
  return s;
}

test("copy matches the asked-for strings verbatim", () => {
  assert.equal(COMMITMENTS_ASK, ASK);
  assert.equal(COMMITMENTS_YES_FOLLOW_UP, YES_FOLLOW_UP);
  assert.equal(COMMITMENTS_NOTE_LABEL, NOTE_LABEL);
  assert.equal(COMMITMENTS_FLAG, "Commitments");
  assert.equal(ASK.includes("debate, or another sport"), false);
});

test("the wizard and one-page form carry the copy and do not import mockups", () => {
  const files = [
    "app/(site)/player-registration/RegistrationWizard.tsx",
    "app/(site)/player-registration/RegistrationForm.tsx",
    "lib/teams/registration-commitments.ts",
    "lib/teams/registration-steps.ts",
  ];
  for (const file of files) {
    const text = src(file);
    assert.equal(/from\s+["'][^"']*mockups/.test(text), false, file);
    assert.equal(text.includes("CommitmentsClickThrough"), false, file);
  }
  const wizard = src("app/(site)/player-registration/RegistrationWizard.tsx");
  assert.equal(wizard.includes("COMMITMENTS_ASK"), true);
  assert.equal(wizard.includes("COMMITMENTS_YES_FOLLOW_UP"), true);
  assert.equal(wizard.includes("COMMITMENTS_NOTE_LABEL"), true);
  assert.match(wizard, /label="Yes"/);
  assert.match(wizard, /label="No"/);
  assert.equal(src("lib/teams/registration-commitments.ts").includes(ASK), true);
  assert.equal(src("lib/teams/registration-commitments.ts").includes(YES_FOLLOW_UP), true);
  assert.equal(src("lib/teams/registration-commitments.ts").includes(NOTE_LABEL), true);
});

test("commitments sit immediately after the homeschool step", () => {
  const fresh = emptyRegistration();
  fresh.kids[0] = { ...fresh.kids[0], athlete_first: "Sam", fee_tier: FEE_TIERS[0] };
  const newFamily = buildRegistrationSteps("new", fresh, new Set(), null);
  const i = newFamily.indexOf("homeschool");
  assert.ok(i >= 0);
  assert.equal(newFamily[i + 1], "commitments");
  assert.equal(newFamily.includes("commitments-note"), false);

  const returning = filled();
  const fromFile = new Set(["p1"]);
  const list = buildRegistrationSteps("returning", returning, fromFile, null);
  const j = list.indexOf("homeschool");
  assert.equal(list[j + 1], "commitments");
  assert.ok(list.indexOf("commitments") > list.indexOf("homeschool"));
  assert.ok(list.indexOf("help-mother") > list.indexOf("commitments"));
});

test("Yes adds the note step; No does not", () => {
  assert.deepEqual(commitmentsSteps(null), ["commitments"]);
  assert.deepEqual(commitmentsSteps(false), ["commitments"]);
  assert.deepEqual(commitmentsSteps(true), ["commitments", "commitments-note"]);

  const no = filled({ commitments_has: false });
  const noSteps = buildRegistrationSteps("returning", no, new Set(["p1"]), null);
  assert.equal(noSteps.includes("commitments-note"), false);

  const yes = filled({ commitments_has: true, commitments_note: "football Tue" });
  const yesSteps = buildRegistrationSteps("returning", yes, new Set(["p1"]), null);
  const k = yesSteps.indexOf("homeschool");
  assert.equal(yesSteps[k + 1], "commitments");
  assert.equal(yesSteps[k + 2], "commitments-note");
});

test("stored extra.commitments is { has, note }", () => {
  assert.deepEqual(extraCommitments(true, "  football Tue/Thu  "), { has: true, note: "football Tue/Thu" });
  assert.deepEqual(extraCommitments(true, "   "), { has: true, note: null });
  assert.deepEqual(extraCommitments(false, "ignored"), { has: false, note: null });
  assert.equal(extraCommitments(null, "x"), null);

  const yes = filled({ commitments_has: true, commitments_note: "  debate Wed  " });
  const rows = toInputs(yes, "2026-09-30");
  assert.deepEqual(extraCommitments(rows[0].commitments_has, rows[0].commitments_note), {
    has: true,
    note: "debate Wed",
  });

  const no = filled({ commitments_has: false, commitments_note: "leftover" });
  const noRows = toInputs(no, "2026-09-30");
  assert.deepEqual(extraCommitments(noRows[0].commitments_has, noRows[0].commitments_note), {
    has: false,
    note: null,
  });
});

test("the form is not sent until commitments is answered", () => {
  assert.equal(registrationProblem(filled()), null);
  const missing = filled({ commitments_has: null });
  assert.match(registrationProblem(missing) ?? "", /commitments/);
  assert.match(commitmentsProblem(null) ?? "", /commitments/);
  assert.equal(commitmentsProblem(true), null);
  assert.equal(commitmentsProblem(false), null);
});

test("admin flag renders on list and detail when has is true", () => {
  const yes = { commitments: { has: true, note: "football Tue <varsity>" } };
  const yesEmpty = { commitments: { has: true, note: null } };
  const no = { commitments: { has: false, note: null } };
  const missing = {};

  assert.deepEqual(commitmentsAdmin(yes), { show: true, flag: "Commitments", note: "football Tue <varsity>" });
  assert.deepEqual(commitmentsAdmin(yesEmpty), { show: true, flag: "Commitments", note: null });
  assert.deepEqual(commitmentsAdmin(no), { show: false, flag: null, note: null });
  assert.deepEqual(commitmentsAdmin(missing), { show: false, flag: null, note: null });

  assert.equal(renderCommitmentsAdmin(yes, "list"), `<span class="commitments-flag">Commitments</span>`);
  assert.equal(
    renderCommitmentsAdmin(yes, "detail"),
    `<span class="commitments-flag">Commitments</span><p class="commitments-note">football Tue &lt;varsity&gt;</p>`
  );
  assert.equal(renderCommitmentsAdmin(yesEmpty, "detail"), `<span class="commitments-flag">Commitments</span>`);
  assert.equal(renderCommitmentsAdmin(no, "list"), "");
  assert.equal(renderCommitmentsAdmin(no, "detail"), "");

  const review = src("app/portal/directory/registrations/RegistrationsReview.tsx");
  assert.match(review, /commitmentsAdmin/);
  assert.match(review, /commitments\.flag/);
  assert.match(review, /commitments\.note/);
  assert.equal((review.match(/commitments\.flag &&/g) ?? []).length >= 2, true);
});

test("a returning family with a new sibling still asks after homeschool", () => {
  const s = fromPrefill(family, ["p1"], [newKid({ athlete_first: "Leo", athlete_last: "Carter", athlete_dob: "2019-01-01" })]);
  const steps = buildRegistrationSteps("returning", s, new Set(["p1"]), null);
  assert.ok(steps.includes("review-kids"));
  assert.ok(steps.some((id) => id.startsWith("name:")));
  const i = steps.indexOf("homeschool");
  assert.equal(steps[i + 1], "commitments");
});
