// The 10U–14U competitive waitlist: Cognito fields, preview-only, same
// waitlist destination tagged "10U-14U competitive waitlist".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COMPETITIVE_MISSING_DB,
  COMPETITIVE_SEND_FAILED,
  COMPETITIVE_WAITLIST_API,
  COMPETITIVE_WAITLIST_COPY,
  COMPETITIVE_WAITLIST_PATH,
  COMPETITIVE_WAITLIST_TAG,
  HOMESCHOOL_HELP,
  PARENT_NA_HELP,
  PRODUCTION_WRITE_BLOCKED,
  competitiveExtra,
  competitiveNotes,
  competitiveSaveGate,
  competitiveWaitlistProblem,
  emptyCompetitiveWaitlist,
  emptyParent,
  friendlyCompetitiveClientError,
  friendlyCompetitiveDbError,
  isNaName,
  isPreviewDeployment,
  looksLikeUsPhone,
  previewWriteBlocked,
  primaryParent,
} from "../../lib/onboarding/competitive-waitlist-form.ts";
import { COMPETITIVE_WAITLIST_STEPS, competitiveStepProblem } from "../../lib/onboarding/competitive-waitlist-steps.ts";
import { DEFAULT_MENU, SITE_PAGES } from "../../lib/website/menu.ts";
import { RESERVED_SLUGS } from "../../lib/website/content.ts";

const filled = () => {
  const w = emptyCompetitiveWaitlist();
  Object.assign(w, {
    athlete_first: "Eli",
    athlete_last: "Miller",
    athlete_dob: "2014-06-01",
    first_experience: true,
    homeschooled: true,
    father: { first: "Jeff", last: "Miller", email: "jeff+OLBTest@malone.net", phone: "4025550101" },
    mother: { first: "N/A", last: "N/A", email: "", phone: "" },
  });
  return w;
};

test("Cognito intro copy is used exactly", () => {
  assert.equal(
    COMPETITIVE_WAITLIST_COPY,
    "Our 10u-14u teams are currently waitlisted but are likely to have a few spaces open in the coming weeks, please fill out this form to be added to the waitlist. We will contact you when space is available.",
  );
  assert.match(HOMESCHOOL_HELP, /LightningBasketballOmaha@gmail.com/);
  assert.match(PARENT_NA_HELP, /N\/A/);
  const artifact = JSON.parse(readFileSync(join(import.meta.dirname, "../../lib/onboarding/cognito-10u-14u-competitive-waitlist.json"), "utf8")) as {
    introText: string;
    fields: { source: string; required: boolean; requiredValue?: string; choices: string[] | null }[];
  };
  assert.equal(artifact.introText, COMPETITIVE_WAITLIST_COPY);
  assert.equal("token" in artifact || "accessToken" in artifact, false);
  const homeschooled = artifact.fields.find((f) => f.source === "IsYourAthleteHomeschooled");
  assert.equal(homeschooled?.required, true);
  assert.equal(homeschooled?.requiredValue, "Yes");
});

test("the waitlist uses the registration wizard and See the whole form toggle", () => {
  const flow = readFileSync(join(import.meta.dirname, "../../app/(site)/10u-14u-waitlist/WaitlistFlow.tsx"), "utf8");
  const wizard = readFileSync(join(import.meta.dirname, "../../app/(site)/10u-14u-waitlist/WaitlistWizard.tsx"), "utf8");
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/10u-14u-waitlist/WaitlistFullForm.tsx"), "utf8");
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/10u-14u-waitlist/page.tsx"), "utf8");
  const chrome = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/wizard-parts.tsx"), "utf8");
  const registration = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationWizard.tsx"), "utf8");
  const registrationForm = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationForm.tsx"), "utf8");
  const registrationFlow = readFileSync(join(import.meta.dirname, "../../app/(site)/player-registration/RegistrationFlow.tsx"), "utf8");

  assert.match(page, /CompetitiveWaitlistFlow/);
  assert.match(flow, /\/api\/10u-14u-waitlist/);
  assert.match(flow, /friendlyCompetitiveClientError/);
  assert.match(wizard, /See the whole form/);
  assert.match(form, /← Back to step by step/);
  assert.equal(wizard.includes("See the whole form"), registration.includes("See the whole form"));
  assert.equal(form.includes("← Back to step by step"), registrationForm.includes("← Back to step by step"));
  assert.match(flow, /hidden=\{view !== "wizard"\}/);
  assert.match(registrationFlow, /hidden=\{view !== "wizard"\}/);
  assert.match(wizard, /from "\.\.\/player-registration\/wizard-parts"/);
  assert.match(wizard, /onChange=\{\(\) => change\("father"\)\}/);
  assert.match(wizard, /onChange=\{\(\) => change\("mother"\)\}/);
  assert.match(registration, /from "\.\/wizard-parts"/);
  assert.match(chrome, /export function Question/);
  assert.match(chrome, /export function Choice/);
  assert.match(chrome, /export function ContinueButton/);
  assert.deepEqual([...COMPETITIVE_WAITLIST_STEPS], [
    "intro",
    "name",
    "birthdate",
    "first-experience",
    "athlete-contact",
    "homeschooled",
    "father",
    "mother",
    "summary",
  ]);
});

test("each wizard step only asks for that step's answers", () => {
  const blank = emptyCompetitiveWaitlist();
  assert.equal(competitiveStepProblem("intro", blank), null);
  assert.match(competitiveStepProblem("name", blank) ?? "", /first and last name/);
  assert.match(competitiveStepProblem("birthdate", blank) ?? "", /birthdate/);
  assert.equal(competitiveStepProblem("first-experience", blank), null);
  assert.equal(competitiveStepProblem("athlete-contact", blank), null);
  assert.match(competitiveStepProblem("homeschooled", blank) ?? "", /homeschooled/);
  assert.match(competitiveStepProblem("father", blank) ?? "", /father/);
  assert.match(competitiveStepProblem("mother", blank) ?? "", /mother/);
  assert.equal(competitiveStepProblem("name", filled()), null);
  assert.equal(competitiveStepProblem("birthdate", filled()), null);
  assert.equal(competitiveStepProblem("father", filled()), null);
  assert.equal(competitiveStepProblem("mother", filled()), null);
});

test("Cognito required flags are enforced", () => {
  const w = filled();
  assert.equal(competitiveWaitlistProblem(w), null);
  w.homeschooled = false;
  assert.match(competitiveWaitlistProblem(w) ?? "", /homeschooled athletes/);
  w.homeschooled = null;
  assert.match(competitiveWaitlistProblem(w) ?? "", /homeschooled/);
  w.homeschooled = true;
  w.father = emptyParent();
  assert.match(competitiveWaitlistProblem(w) ?? "", /father/);
  w.father = { first: "Jeff", last: "Miller", email: "not-an-email", phone: "4025550101" };
  assert.match(competitiveWaitlistProblem(w) ?? "", /father's email/);
  w.father = { first: "N/A", last: "N/A", email: "", phone: "" };
  assert.equal(competitiveWaitlistProblem(w), null);
});

test("US phone and N/A helpers match the Cognito fields", () => {
  assert.equal(looksLikeUsPhone("4025550101"), true);
  assert.equal(looksLikeUsPhone("(402) 555-0101"), true);
  assert.equal(looksLikeUsPhone("555"), false);
  assert.equal(isNaName({ first: "N/A", last: "N/A", email: "", phone: "" }), true);
  assert.equal(isNaName({ first: "Jeff", last: "Miller", email: "", phone: "" }), false);
  const parent = primaryParent(filled());
  assert.equal(parent.email, "jeff+olbtest@malone.net");
  assert.match(parent.name, /Jeff Miller/);
});

test("submissions keep the waitlist source and are tagged 10U-14U competitive waitlist", () => {
  const extra = competitiveExtra(filled());
  assert.equal(extra.source, "waitlist_form");
  assert.equal(extra.tag, COMPETITIVE_WAITLIST_TAG);
  assert.equal(COMPETITIVE_WAITLIST_TAG, "10U-14U competitive waitlist");
  assert.equal(extra.intake.homeschooled, true);
  assert.equal(extra.intake.first_experience, true);
  assert.equal(extra.father?.first, "Jeff");
  assert.equal(extra.mother?.first, "N/A");
  assert.equal(competitiveNotes(filled()), null);
  assert.equal(competitiveNotes({ ...filled(), homeschooled: false }), "Not homeschooled, from the 10U-14U competitive waitlist.");
});

test("the page is preview-only, noindexed, and not on the public site", () => {
  assert.equal(isPreviewDeployment({}), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "development" }), true);
  assert.equal(isPreviewDeployment({ VERCEL_ENV: "production" }), false);
  assert.equal(previewWriteBlocked({ VERCEL_ENV: "production" }), PRODUCTION_WRITE_BLOCKED);
  assert.equal(previewWriteBlocked({ VERCEL_ENV: "preview" }), null);

  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/10u-14u-waitlist/page.tsx"), "utf8");
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(page, /isPreviewDeployment/);
  assert.match(page, /notFound/);

  const save = readFileSync(join(import.meta.dirname, "../../lib/onboarding/competitive-waitlist-save.ts"), "utf8");
  const api = readFileSync(join(import.meta.dirname, "../../app/api/10u-14u-waitlist/route.ts"), "utf8");
  assert.match(save, /competitiveSaveGate/);
  assert.match(save, /competitiveExtra/);
  assert.match(save, /status:\s*"waitlisted"/);
  assert.match(api, /saveCompetitiveWaitlist/);
  assert.doesNotMatch(save, /waitlist_reply/);

  assert.equal(COMPETITIVE_WAITLIST_PATH, "/10u-14u-waitlist");
  assert.equal(COMPETITIVE_WAITLIST_API, "/api/10u-14u-waitlist");
  assert.ok(RESERVED_SLUGS.includes("10u-14u-waitlist"));
  assert.equal(SITE_PAGES.some((p) => p.href === COMPETITIVE_WAITLIST_PATH), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("10u-14u-waitlist"), false);
  assert.equal(JSON.stringify(DEFAULT_MENU).includes("competitive waitlist"), false);
});

test("a production save is blocked with a specific message and never looks up the database", () => {
  const res = competitiveSaveGate(filled(), "", { VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "not-used" });
  assert.deepEqual(res, { error: PRODUCTION_WRITE_BLOCKED, status: 403 });
});

test("preview validation errors are returned clearly without a generic catch", () => {
  const res = competitiveSaveGate(emptyCompetitiveWaitlist(), "", { VERCEL_ENV: "preview" });
  assert.equal(res?.status, 400);
  assert.match(res?.error ?? "", /first and last name/);
});

test("preview without database env explains the missing setup", () => {
  const res = competitiveSaveGate(filled(), "", { VERCEL_ENV: "preview" });
  assert.deepEqual(res, { error: COMPETITIVE_MISSING_DB, status: 503 });
});

test("a configured preview is allowed past the write guard", () => {
  assert.equal(
    competitiveSaveGate(filled(), "", {
      VERCEL_ENV: "preview",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "not-a-real-key",
    }),
    null,
  );
});

test("database and client failures have specific messages", () => {
  assert.match(friendlyCompetitiveDbError({ code: "42501", message: "permission denied for table olb_registrations" }), /database permission/);
  assert.match(friendlyCompetitiveDbError({ code: "PGRST204", message: "Could not find the 'tag' column" }), /don't match/);
  assert.match(friendlyCompetitiveDbError({ code: "23503", message: "foreign key" }), /isn't open/);
  assert.match(friendlyCompetitiveClientError(new Error("Invalid Server Actions request.")), /request was blocked/);
  assert.match(friendlyCompetitiveClientError(new Error("Failed to find Server Action")), /out of date/);
  assert.equal(friendlyCompetitiveClientError(new Error("boom")), COMPETITIVE_SEND_FAILED);
});

test("staff waitlist cards show the competitive tag", () => {
  const review = readFileSync(join(import.meta.dirname, "../../app/portal/directory/registrations/RegistrationsReview.tsx"), "utf8");
  const panel = readFileSync(join(import.meta.dirname, "../../app/portal/directory/registrations/WorkflowPanel.tsx"), "utf8");
  assert.match(review, /x\.tag \|\| "From the waitlist form"/);
  assert.match(review, /x\.source === "waitlist_form"/);
  assert.match(panel, /First Lightning experience/);
  assert.match(panel, /i\.father/);
});
