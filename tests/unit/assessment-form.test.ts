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
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/AssessmentForm.tsx"), "utf8");
  assert.match(form, /ASSESSMENT_COPY/);
  assert.match(form, /PROGRAMS_INFO_URL/);
  assert.match(form, /Practice times and payment info/);
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
