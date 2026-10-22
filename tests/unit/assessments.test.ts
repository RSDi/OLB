// Assessments: age/grade rules, public picker, admin path, migration grants,
// and waitlist extra. Table is not applied; builtins stand in on preview.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ASSESSMENT_COPY,
  BUILTIN_14U,
  BUILTIN_HS,
  BUILTIN_ASSESSMENTS,
  assessmentPublicPath,
  assessmentRuleLabel,
  assessmentTag,
  cleanAssessmentInput,
  emptyAssessmentInput,
  isValidAssessmentSlug,
  normalizeAssessmentSlug,
  openAssessmentsFor,
  playerFitsAssessment,
  tableMissing,
  toPublicAssessment,
} from "../../lib/onboarding/assessments.ts";
import { REGISTRATION_SEASON } from "../../lib/teams/registration-form.ts";
import { assessmentExtra, assessmentProblem, is14uEligible } from "../../lib/onboarding/assessment-form.ts";
import { emptyWaitlist } from "../../lib/onboarding/waitlist-form.ts";
import { centralHour } from "../../lib/onboarding/dates.ts";

const filled = (patch: Record<string, unknown> = {}) => {
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
    ...patch,
  });
  return w;
};

test("14U and high school samples are the builtin assessments", () => {
  assert.equal(BUILTIN_14U.slug, "14u");
  assert.equal(BUILTIN_14U.open, true);
  assert.equal(BUILTIN_14U.details, ASSESSMENT_COPY);
  assert.equal(BUILTIN_HS.slug, "high-school");
  assert.equal(BUILTIN_HS.open, true);
  assert.equal(BUILTIN_HS.grade_from, 9);
  assert.equal(BUILTIN_HS.grade_to, 12);
  assert.deepEqual(BUILTIN_ASSESSMENTS.map((a) => a.slug), ["14u", "high-school"]);
});

// The seed and builtin 14U window is the existing lock (lowestEligibleLevel
// === 14U on season end 2026-12-31): 2012-01-01 through 2013-12-31. The
// August 1 fee cutoff is a different window (2011-08-02 through 2013-08-01)
// and is not the assessment lock — a boy born 2011-10-25 is 14U for fees
// and 16U for the team; a boy born 2013-12-31 is 12U for fees and 14U here.
test("the 14U seed matches the existing 14U lock, not the August 1 fee window", () => {
  assert.equal(BUILTIN_14U.dob_from, "2012-01-01");
  assert.equal(BUILTIN_14U.dob_to, "2013-12-31");
  const edges = [
    ["2011-08-02", false],
    ["2011-10-25", false],
    ["2011-12-31", false],
    ["2012-01-01", true],
    ["2013-08-02", true],
    ["2013-12-31", true],
    ["2014-01-01", false],
  ] as const;
  for (const [dob, ok] of edges) {
    assert.equal(is14uEligible(dob), ok, dob);
    assert.equal(playerFitsAssessment(BUILTIN_14U, dob, null), ok, dob);
  }
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0159_olb_assessments.sql"), "utf8");
  assert.match(sql, /'2012-01-01'/);
  assert.match(sql, /'2013-12-31'/);
});

test("a player fits an assessment by birthday or grade", () => {
  assert.equal(playerFitsAssessment(BUILTIN_14U, "2012-06-01", null), true);
  assert.equal(playerFitsAssessment(BUILTIN_14U, "2014-06-15", null), false);
  assert.equal(playerFitsAssessment(BUILTIN_14U, "2012-06-01", 10), true);
  assert.equal(playerFitsAssessment(BUILTIN_HS, "2010-01-01", 10), true);
  assert.equal(playerFitsAssessment(BUILTIN_HS, "2010-01-01", 8), false);
  assert.equal(playerFitsAssessment(BUILTIN_HS, "", 11), true);

  const both = { ...BUILTIN_14U, grade_from: 8, grade_to: 8 };
  assert.equal(playerFitsAssessment(both, "2014-06-15", 8), true);
  assert.equal(playerFitsAssessment(both, "2014-06-15", 7), false);

  const matches = openAssessmentsFor(BUILTIN_ASSESSMENTS, "2012-06-01", 7);
  assert.deepEqual(matches.map((a) => a.slug), ["14u"]);
  const hs = openAssessmentsFor(BUILTIN_ASSESSMENTS, "2010-01-01", 11);
  assert.deepEqual(hs.map((a) => a.slug), ["high-school"]);
  const either = openAssessmentsFor(BUILTIN_ASSESSMENTS, "2012-06-01", 10);
  assert.deepEqual(either.map((a) => a.slug), ["14u", "high-school"]);
});

test("Which assessment? lists only the open ones that fit", () => {
  const picker = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/AssessmentPicker.tsx"), "utf8");
  assert.match(picker, /Which assessment\?/);
  assert.match(picker, /openAssessmentsFor/);
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/page.tsx"), "utf8");
  assert.match(page, /AssessmentPicker/);
  assert.match(page, /loadOpenAssessments/);
});

test("slugs stay simple and the public path is /assessments/<slug>", () => {
  assert.equal(normalizeAssessmentSlug("High School!"), "high-school");
  assert.equal(isValidAssessmentSlug("14u"), true);
  assert.equal(isValidAssessmentSlug("high-school"), true);
  assert.equal(isValidAssessmentSlug("assessments"), false);
  assert.equal(isValidAssessmentSlug("14u-assessment"), false);
  assert.equal(assessmentPublicPath(BUILTIN_14U), "/assessments/14u");
  assert.equal(assessmentTag(BUILTIN_14U), "14U assessment");
  assert.equal(assessmentTag(BUILTIN_HS), "High school assessment");
  assert.match(assessmentRuleLabel(BUILTIN_14U), /birthday/i);
  assert.match(assessmentRuleLabel(BUILTIN_HS), /9th–12th/);
});

test("admin cleaning rejects a blank name and a blocked slug", () => {
  const blank = cleanAssessmentInput(emptyAssessmentInput());
  assert.ok("error" in blank);
  const bad = cleanAssessmentInput({ ...emptyAssessmentInput(), name: "Waitlist", slug: "waitlist" });
  assert.ok("error" in bad);
  const ok = cleanAssessmentInput({
    ...emptyAssessmentInput(),
    name: "High school assessment",
    slug: "high-school",
    grade_from: "9",
    grade_to: "12",
    details: "Come try out.",
    open: true,
  });
  assert.ok(!("error" in ok));
  if ("error" in ok) return;
  assert.equal(ok.slug, "high-school");
  assert.equal(ok.grade_from, 9);
  assert.equal(ok.open, true);
});

test("a missing table is detected so preview can use the samples", () => {
  assert.equal(tableMissing({ code: "42P01", message: "relation olb_assessments does not exist" }), true);
  assert.equal(tableMissing({ code: "PGRST205", message: "Could not find the table 'public.olb_assessments' in the schema cache" }), true);
  assert.equal(tableMissing({ code: "42501", message: "permission denied" }), false);
});

test("waitlist extra keeps source waitlist_form and adds assessment_id plus a tag", () => {
  const extra = assessmentExtra(filled({ grade: "10" }), BUILTIN_HS);
  assert.equal(extra.source, "waitlist_form");
  assert.equal(extra.tag, "High school assessment");
  assert.equal(extra.assessment_id, BUILTIN_HS.id);
  assert.equal(extra.assessment_slug, "high-school");
  assert.equal(extra.intake.level, "HS");
  assert.equal(extra.intake.grade, "10");
  assert.equal(extra.first_season, true);
  const waitlist = readFileSync(join(import.meta.dirname, "../../lib/onboarding/public-actions.ts"), "utf8");
  assert.match(waitlist, /source: "waitlist_form"/);
  assert.doesNotMatch(waitlist, /assessment_id/);
});

test("high school uses the grade rule, 14U keeps the birthday message", () => {
  const hs = filled({ athlete_dob: "2010-01-01", grade: "8" });
  assert.match(assessmentProblem(hs, BUILTIN_HS) ?? "", /9th–12th|grade/i);
  hs.grade = "11";
  assert.equal(assessmentProblem(hs, BUILTIN_HS), null);
});

test("the migration creates olb_assessments with staff select and service-role writes", () => {
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0159_olb_assessments.sql"), "utf8");
  assert.match(sql, /create table if not exists public\.olb_assessments/);
  assert.match(sql, /revoke all on public\.olb_assessments from anon, authenticated;/);
  assert.match(sql, /grant select on public\.olb_assessments to authenticated, service_role;/);
  assert.match(sql, /grant insert, update, delete on public\.olb_assessments to service_role;/);
  assert.doesNotMatch(sql, /grant select, insert, update, delete on public\.olb_assessments to authenticated/);
  assert.match(sql, /using \(\(select public\.is_staff\(\)\) or \(select public\.can_manage_registrations\(\)\)\)/);
  assert.doesNotMatch(sql, /create policy "olb_assessments_insert"/);
  assert.match(sql, /slug, name, level, dob_from, dob_to/);
  assert.match(sql, /'14u'/);
  assert.match(sql, new RegExp(`where b\\.season = '${REGISTRATION_SEASON}'`));
  assert.doesNotMatch(sql, /high-school/);
  assert.match(sql, /Do not apply on production/);
});

test("Assessment thanks and reminder match Off / Ask me first / On plus Words", () => {
  const automations = readFileSync(join(import.meta.dirname, "../../lib/onboarding/automations.ts"), "utf8");
  const emails = readFileSync(join(import.meta.dirname, "../../lib/onboarding/email-text.ts"), "utf8");
  const tab = readFileSync(join(import.meta.dirname, "../../app/portal/settings/RegistrationAutomationsTab.tsx"), "utf8");
  const save = readFileSync(join(import.meta.dirname, "../../lib/onboarding/assessment-save.ts"), "utf8");
  const cron = readFileSync(join(import.meta.dirname, "../../lib/onboarding/cron.ts"), "utf8");
  const waitlist = readFileSync(join(import.meta.dirname, "../../app/portal/directory/registrations/RegistrationsReview.tsx"), "utf8");
  assert.match(automations, /assessment_thanks/);
  assert.match(automations, /assessment_reminder/);
  assert.match(automations, /assessment_thanks: "ask"/);
  assert.match(automations, /assessment_reminder: "ask"/);
  assert.match(emails, /Thanks for signing \{player\} up for \{assessment\}/);
  assert.match(emails, /\{assessment\} is in two days/);
  assert.doesNotMatch(emails, /not offered/i);
  assert.match(tab, /defaultMode/);
  assert.match(tab, /Assessment thanks and Assessment reminder start Ask me first/);
  assert.match(save, /assessment_thanks/);
  assert.match(save, /composeAssessmentEmail/);
  assert.doesNotMatch(save, /waitlist_reply/);
  assert.match(cron, /assessment_reminder/);
  assert.match(cron, /daysBetween\(today, centralDay/);
  assert.match(cron, /a\.open &&/);
  assert.match(cron, /builtin-/);
  assert.match(cron, /centralHour\(now\) !== 9/);
  assert.match(cron, /if \(centralHour\(now\) !== 9\) return summary/);
  assert.match(waitlist, /waitlist-assessment-filter/);
  assert.match(waitlist, /waitlistAssessmentLabel/);
  const vercel = readFileSync(join(import.meta.dirname, "../../vercel.json"), "utf8");
  assert.match(vercel, /"17 14 \* \* \*"/);
  assert.match(vercel, /"17 15 \* \* \*"/);
});

test("the off-hour onboarding cron does no daily work and no Slack check", () => {
  // 8 AM CT (winter) and 10 AM CT (summer). cron.ts returns the empty
  // summary before any board, Slack, or reminder work when the hour isn't 9.
  assert.equal(centralHour(new Date("2026-01-15T14:17:00.000Z")), 8);
  assert.equal(centralHour(new Date("2026-07-15T15:17:00.000Z")), 10);
  const cron = readFileSync(join(import.meta.dirname, "../../lib/onboarding/cron.ts"), "utf8");
  assert.match(cron, /if \(centralHour\(now\) !== 9\) return summary/);
  assert.match(cron, /boards: 0/);
  assert.match(cron, /slackChecked: 0/);
  assert.match(cron, /assessmentReminders: 0/);
});

test("public pages strip thanks and reminder wording", () => {
  const pub = toPublicAssessment({ ...BUILTIN_14U, thanks_subject: "Hi", thanks_body: "Thanks", reminder_subject: "See you", reminder_body: "Tomorrow" });
  assert.equal(pub.slug, "14u");
  assert.equal(pub.name, "14U assessment");
  assert.equal("thanks_subject" in pub, false);
  assert.equal("reminder_body" in pub, false);
  const list = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/page.tsx"), "utf8");
  const slug = readFileSync(join(import.meta.dirname, "../../app/(site)/assessments/[slug]/page.tsx"), "utf8");
  const data = readFileSync(join(import.meta.dirname, "../../lib/onboarding/assessment-data.ts"), "utf8");
  const open = readFileSync(join(import.meta.dirname, "../../lib/onboarding/assessment-actions.ts"), "utf8");
  assert.match(list, /toPublicAssessment/);
  assert.match(slug, /toPublicAssessment/);
  assert.match(data, /return \{ assessments: rows, fromTable: true \}/);
  assert.doesNotMatch(data, /if \(!rows\.length\) return \{ assessments: BUILTIN_ASSESSMENTS, fromTable: true \}/);
  assert.match(data, /if \(fromTable\) return null/);
  assert.match(open, /\.eq\("board_id", boardId\)/);
});

test("admin lives at Settings → Assessments and the 14U URL redirects", () => {
  const settings = readFileSync(join(import.meta.dirname, "../../app/portal/settings/page.tsx"), "utf8");
  assert.match(settings, /key: "assessments"/);
  assert.match(settings, /AssessmentsTab/);
  assert.match(settings, /canManageRegistrations/);
  const tab = readFileSync(join(import.meta.dirname, "../../app/portal/settings/AssessmentsTab.tsx"), "utf8");
  assert.match(tab, /New assessment/);
  assert.match(tab, /Open/);
  assert.match(tab, /Close/);
  const redirect = readFileSync(join(import.meta.dirname, "../../app/(site)/14u-assessment/page.tsx"), "utf8");
  assert.match(redirect, /redirect/);
  const guide = readFileSync(join(import.meta.dirname, "../../lib/help/guide.ts"), "utf8");
  assert.match(guide, /id: "settings-assessments"/);
  assert.match(guide, /preview: true/);
});
