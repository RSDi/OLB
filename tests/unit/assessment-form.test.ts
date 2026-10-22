// The 14U assessment form: Rachel's copy, 14U-only, preview-only, same
// waitlist destination tagged "14U assessment".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSESSMENT_COPY,
  ASSESSMENT_LEVEL,
  ASSESSMENT_PATH,
  ASSESSMENT_TAG,
  PROGRAMS_INFO_URL,
  assessmentExtra,
  assessmentNotes,
  assessmentProblem,
  is14uEligible,
} from "../../lib/onboarding/assessment-form.ts";
import { ASSESSMENT_STEPS, assessmentStepProblem } from "../../lib/onboarding/assessment-steps.ts";
import { isPreviewDeployment } from "../../lib/onboarding/preview-only.ts";
import { emptyWaitlist } from "../../lib/onboarding/waitlist-form.ts";
import { DEFAULT_MENU, SITE_PAGES } from "../../lib/website/menu.ts";
import { RESERVED_SLUGS } from "../../lib/website/content.ts";

const filled = () => {
  const w = emptyWaitlist();
  Object.assign(w, {
    athlete_first: "Eli",
    athlete_last: "Miller",
    athlete_dob: "2012-06-01",
    homeschooled: true,
    parent_first: "Megan",
    parent_last: "Miller",
    email: "megan@example.com",
    experience: "Rec league",
  });
  return w;
};

test("Rachel's assessment copy is used exactly", () => {
  assert.equal(
    ASSESSMENT_COPY,
    "We are accepting two more players at the 14U level. Please sign up for an assessment if you are interested in being considered. Playing for Omaha Lightning is a commitment to a competitive team, October through February. Practices have already begun, so assessments will be immediate."
  );
  for (const file of [
    "app/(site)/14u-assessment/AssessmentForm.tsx",
    "app/(site)/14u-assessment/AssessmentWizard.tsx",
  ]) {
    const text = readFileSync(join(import.meta.dirname, "../..", file), "utf8");
    assert.match(text, /ASSESSMENT_COPY/);
    assert.match(text, /PROGRAMS_INFO_URL/);
    assert.match(text, /Practice times and payment info/);
  }
});

test("the assessment uses the registration wizard and See the whole form toggle", () => {
  const flow = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/AssessmentFlow.tsx"), "utf8");
  const wizard = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/AssessmentWizard.tsx"), "utf8");
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/AssessmentForm.tsx"), "utf8");
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/page.tsx"), "utf8");
  const chrome = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/wizard-parts.tsx"), "utf8");
  const registration = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationWizard.tsx"), "utf8");
  const registrationForm = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationForm.tsx"), "utf8");
  const registrationFlow = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationFlow.tsx"), "utf8");

  assert.match(page, /AssessmentFlow/);
  assert.match(wizard, /See the whole form/);
  assert.match(form, /← Back to step by step/);
  assert.equal(wizard.includes("See the whole form"), registration.includes("See the whole form"));
  assert.equal(form.includes("← Back to step by step"), registrationForm.includes("← Back to step by step"));
  assert.match(flow, /hidden=\{view !== "wizard"\}/);
  assert.match(registrationFlow, /hidden=\{view !== "wizard"\}/);
  assert.match(wizard, /from "\.\.\/player-registration\/wizard-parts"/);
  assert.match(wizard, /onChange=\{\(\) => change\("you"\)\}/);
  assert.match(wizard, /onChange=\{\(\) => change\("contact"\)\}/);
  assert.match(registration, /from "\.\/wizard-parts"/);
  assert.match(chrome, /export function Question/);
  assert.match(chrome, /export function Choice/);
  assert.match(chrome, /export function ContinueButton/);
  assert.deepEqual([...ASSESSMENT_STEPS], [
    "intro",
    "name",
    "dob",
    "homeschooled",
    "experience",
    "friends",
    "heard",
    "you",
    "contact",
    "notes",
    "summary",
  ]);
});

test("each wizard step only asks for that step's answers", () => {
  const blank = emptyWaitlist();
  assert.equal(assessmentStepProblem("intro", blank), null);
  assert.match(assessmentStepProblem("name", blank) ?? "", /first and last name/);
  assert.match(assessmentStepProblem("dob", blank) ?? "", /birthday/);
  assert.match(assessmentStepProblem("homeschooled", blank) ?? "", /homeschooled/);
  assert.match(assessmentStepProblem("experience", blank) ?? "", /played before/);
  assert.equal(assessmentStepProblem("friends", blank), null);
  assert.equal(assessmentStepProblem("heard", blank), null);
  assert.match(assessmentStepProblem("you", blank) ?? "", /your name/);
  assert.match(assessmentStepProblem("contact", blank) ?? "", /email/);
  assert.equal(assessmentStepProblem("notes", blank), null);
  assert.equal(assessmentStepProblem("summary", blank), null);

  const w = filled();
  w.athlete_dob = "2015-06-01";
  assert.match(assessmentStepProblem("dob", w) ?? "", /14U players only/);
  assert.equal(assessmentStepProblem("name", filled()), null);
  assert.equal(assessmentStepProblem("dob", filled()), null);
  assert.equal(assessmentStepProblem("contact", filled()), null);
});

test("the Programs page is the real practice-times and payment page", () => {
  assert.equal(PROGRAMS_INFO_URL, "https://omahalightningbasketball.com/programs");
});

test("only 14U-aged players can send the assessment", () => {
  assert.equal(is14uEligible("2012-06-01"), true);
  assert.equal(is14uEligible("2012-01-01"), true);
  assert.equal(is14uEligible("2014-06-15"), false); // 12U
  assert.equal(is14uEligible("2011-10-25"), false); // 16U
  assert.equal(is14uEligible("2015-06-01"), false);

  const w = filled();
  assert.equal(assessmentProblem(w), null);
  w.athlete_dob = "2015-06-01";
  assert.match(assessmentProblem(w) ?? "", /14U players only/);
  w.athlete_dob = "";
  assert.match(assessmentProblem(w) ?? "", /birthday/);
});

test("submissions keep the waitlist source and are tagged 14U assessment", () => {
  const extra = assessmentExtra(filled());
  assert.equal(extra.source, "waitlist_form");
  assert.equal(extra.tag, ASSESSMENT_TAG);
  assert.equal(ASSESSMENT_TAG, "14U assessment");
  assert.equal(extra.intake.level, ASSESSMENT_LEVEL);
  assert.equal(extra.first_season, true);
  assert.equal(assessmentNotes(filled()), null);
  assert.equal(assessmentNotes({ ...filled(), homeschooled: false }), "Not homeschooled, from the 14U assessment form.");
});

test("the page is preview-only, noindexed, and not on the public site", () => {
  assert.equal(isPreviewDeployment({}), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "development" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "production" }), false);

  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/page.tsx"), "utf8");
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(page, /isPreviewDeployment/);
  assert.match(page, /notFound/);

  const action = readFileSync(join(import.meta.dirname, "../../lib/onboarding/public-actions.ts"), "utf8");
  assert.match(action, /join14uAssessment/);
  assert.match(action, /isPreviewDeployment/);
  assert.match(action, /assessmentExtra/);
  assert.match(action, /status:\s*"waitlisted"/);
  assert.doesNotMatch(action.slice(action.indexOf("join14uAssessment")), /waitlist_reply/);

  assert.equal(ASSESSMENT_PATH, "/14u-assessment");
  assert.ok(RESERVED_SLUGS.includes("14u-assessment"));
  assert.equal(SITE_PAGES.some((p) => p.href === ASSESSMENT_PATH), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("14u-assessment"), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("assessment"), false);
});
