// The 14U assessment form: Rachel's copy, 14U-only, same waitlist
// destination tagged "14U assessment". Assessments is on the production
// write allowlist; other guarded paths stay blocked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSESSMENT_COPY,
  ASSESSMENT_LEVEL,
  ASSESSMENT_MISSING_DB,
  ASSESSMENT_PATH,
  ASSESSMENT_SEND_FAILED,
  ASSESSMENT_TAG,
  ASSESSMENTS_PATH,
  PROGRAMS_INFO_URL,
  assessmentExtra,
  assessmentNotes,
  assessmentProblem,
  assessmentSaveGate,
  friendlyAssessmentClientError,
  friendlyAssessmentDbError,
  is14uEligible,
} from "../../lib/onboarding/assessment-form.ts";
import { ASSESSMENT_STEPS, assessmentStepProblem, assessmentStepsFor } from "../../lib/onboarding/assessment-steps.ts";
import { BUILTIN_14U, BUILTIN_HS } from "../../lib/onboarding/assessments.ts";
import { PRODUCTION_ALLOWED, PRODUCTION_WRITE_BLOCKED, isPreviewDeployment, previewRouteOpen, previewWriteBlocked } from "../../lib/onboarding/preview-only.ts";
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
  assert.equal(BUILTIN_14U.details, ASSESSMENT_COPY);
  for (const file of [
    "app/(site)/assessments/AssessmentForm.tsx",
    "app/(site)/assessments/AssessmentWizard.tsx",
  ]) {
    const text = readFileSync(join(import.meta.dirname, "../..", file), "utf8");
    assert.match(text, /assessment\.details/);
    assert.match(text, /PROGRAMS_INFO_URL/);
    assert.match(text, /Practice times and payment info/);
  }
});

test("the assessment uses the registration wizard and See the whole form toggle", () => {
  const flow = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentFlow.tsx"), "utf8");
  const wizard = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentWizard.tsx"), "utf8");
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentForm.tsx"), "utf8");
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/[slug]/page.tsx"), "utf8");
  const chrome = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/wizard-parts.tsx"), "utf8");
  const registration = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationWizard.tsx"), "utf8");
  const registrationForm = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationForm.tsx"), "utf8");
  const registrationFlow = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationFlow.tsx"), "utf8");

  assert.match(page, /AssessmentFlow/);
  assert.match(flow, /\/api\/assessments/);
  assert.match(flow, /friendlyAssessmentClientError/);
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
  assert.ok(!assessmentStepsFor(BUILTIN_14U).includes("grade"));
  assert.ok(assessmentStepsFor(BUILTIN_HS).includes("grade"));
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

test("both assessment views use the same short name labels", () => {
  const wizard = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentWizard.tsx"), "utf8");
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentForm.tsx"), "utf8");
  for (const text of [wizard, form]) {
    assert.match(text, /^\s+First name$/m);
    assert.match(text, /^\s+Last name$/m);
    assert.match(text, /^\s+Friends on Lightning$/m);
    assert.match(text, /^\s+Notes$/m);
    assert.doesNotMatch(text, /His first name/);
    assert.doesNotMatch(text, /His last name/);
  }
});

test("assessment date fields stay inside the card on a phone", () => {
  const css = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/wizard.module.css"), "utf8");
  assert.match(css, /\.card\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.field\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.field input\[type="date"\][\s\S]*display:\s*block/);
  assert.match(css, /\.field input\[type="date"\][\s\S]*width:\s*100%/);
  assert.match(css, /\.field input\[type="date"\][\s\S]*max-width:\s*100%/);
  assert.match(css, /\.field input\[type="date"\][\s\S]*min-width:\s*0/);
  assert.match(css, /\.field input\[type="date"\][\s\S]*box-sizing:\s*border-box/);
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
  assert.equal(extra.assessment_id, BUILTIN_14U.id);
  assert.equal(extra.assessment_slug, "14u");
  assert.equal(extra.intake.level, ASSESSMENT_LEVEL);
  assert.equal(extra.first_season, true);
  assert.equal(assessmentNotes(filled()), null);
  assert.equal(assessmentNotes({ ...filled(), homeschooled: false }), "Not homeschooled, from the 14U assessment form.");
});

test("the page is noindexed and not on the public site menu", () => {
  assert.equal(isPreviewDeployment({}), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "development" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "production" }), false);
  assert.equal(previewWriteBlocked("waitlist", { VERCEL_ENV: "production" }), PRODUCTION_WRITE_BLOCKED);
  assert.equal(previewWriteBlocked("waitlist", { VERCEL_ENV: "preview" }), null);
  assert.equal(previewWriteBlocked("assessments", { VERCEL_ENV: "production" }), null);
  assert.equal(previewWriteBlocked("assessments", { VERCEL_ENV: "preview" }), null);

  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/page.tsx"), "utf8");
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(page, /previewRouteOpen\("assessments"\)/);
  assert.match(page, /notFound/);
  assert.match(page, /redirect/);
  assert.match(page, /assessments\/14u|assessmentPublicPath/);

  const list = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/page.tsx"), "utf8");
  assert.match(list, /Which assessment\?|AssessmentPicker/);
  assert.match(list, /previewRouteOpen\("assessments"\)/);
  const slug = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/[slug]/page.tsx"), "utf8");
  assert.match(slug, /previewRouteOpen\("assessments"\)/);

  const action = readFileSync(join(import.meta.dirname, "../../lib/onboarding/public-actions.ts"), "utf8");
  const save = readFileSync(join(import.meta.dirname, "../../lib/onboarding/assessment-save.ts"), "utf8");
  const api = readFileSync(join(import.meta.dirname, "../../app/api/14u-assessment/route.ts"), "utf8");
  const apiAll = readFileSync(join(import.meta.dirname, "../../app/api/assessments/route.ts"), "utf8");
  assert.match(action, /join14uAssessment/);
  assert.match(action, /save14uAssessment/);
  assert.match(save, /assessmentSaveGate/);
  assert.match(save, /assessmentExtra/);
  assert.match(save, /status:\s*"waitlisted"/);
  assert.match(save, /previewWriteBlocked\("assessments"/);
  assert.match(api, /save14uAssessment/);
  assert.match(apiAll, /saveAssessment/);
  assert.doesNotMatch(save, /waitlist_reply/);

  assert.equal(ASSESSMENT_PATH, "/14u-assessment");
  assert.equal(ASSESSMENTS_PATH, "/assessments");
  assert.ok(RESERVED_SLUGS.includes("14u-assessment"));
  assert.ok(RESERVED_SLUGS.includes("assessments"));
  assert.equal(SITE_PAGES.some((p) => p.href === ASSESSMENT_PATH), false);
  assert.equal(SITE_PAGES.some((p) => p.href === ASSESSMENTS_PATH), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("14u-assessment"), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("assessment"), false);
});

test("production allows Assessments writes and still blocks other guarded features", () => {
  const prod = {
    VERCEL_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
  };
  assert.deepEqual([...PRODUCTION_ALLOWED], ["assessments"]);
  assert.equal(previewRouteOpen("assessments", prod), true);
  assert.equal(previewWriteBlocked("assessments", prod), null);
  assert.equal(assessmentSaveGate(filled(), "", prod), null);

  assert.equal(previewRouteOpen("waitlist", prod), false);
  assert.equal(previewWriteBlocked("waitlist", prod), PRODUCTION_WRITE_BLOCKED);

  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/page.tsx"), "utf8");
  assert.match(settings, /fullUi \|\| isPreviewDeployment\(\)/);
  const pairing = readFileSync(join(import.meta.dirname, "../../app/(site)/login/phone/preview/page.tsx"), "utf8");
  assert.match(pairing, /PAIRING_UI_PREVIEW/);
  assert.match(pairing, /notFound\(\)/);
});

test("preview validation errors are returned clearly without a generic catch", () => {
  const res = assessmentSaveGate(emptyWaitlist(), "", { VERCEL_ENV: "preview" });
  assert.equal(res?.status, 400);
  assert.match(res?.error ?? "", /first and last name/);
});

test("preview without database env explains the missing setup", () => {
  const res = assessmentSaveGate(filled(), "", { VERCEL_ENV: "preview" });
  assert.deepEqual(res, { error: ASSESSMENT_MISSING_DB, status: 503 });
});

test("a configured preview is allowed past the write guard", () => {
  assert.equal(
    assessmentSaveGate(filled(), "", {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
    }),
    null,
  );
});

test("database and client failures have specific messages", () => {
  assert.match(friendlyAssessmentDbError({ code: "42501", message: "permission denied for table olb_registrations" }), /database permission/);
  assert.match(friendlyAssessmentDbError({ code: "PGRST204", message: "Could not find the 'tag' column" }), /don't match/);
  assert.match(friendlyAssessmentDbError({ code: "23503", message: "foreign key" }), /isn't open/);
  assert.match(friendlyAssessmentClientError(new Error("Invalid Server Actions request.")), /request was blocked/);
  assert.match(friendlyAssessmentClientError(new Error("Failed to find Server Action")), /out of date/);
  assert.equal(friendlyAssessmentClientError(new Error("boom")), ASSESSMENT_SEND_FAILED);
});
