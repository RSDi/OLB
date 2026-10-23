// Assessment confirmation and club notice (lib/teams/assessment-receipt.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { emailText } from "../../lib/teams/registration-email-text.ts";
import {
  assessmentHtml,
  assessmentNoticeSubject,
  assessmentNoticeText,
  assessmentSubject,
  assessmentText,
} from "../../lib/teams/assessment-receipt.ts";
import { BUILTIN_14U } from "../../lib/onboarding/assessments.ts";
import type { WaitlistInput } from "../../lib/onboarding/waitlist-form.ts";

const input = (more: Partial<WaitlistInput> = {}): WaitlistInput => ({
  parent_first: "Jamie",
  parent_last: "Carter",
  email: "jamie@example.com",
  phone: "402-555-0101",
  athlete_first: "Sam",
  athlete_last: "Carter",
  athlete_dob: "2012-05-01",
  homeschooled: true,
  experience: "Rec league",
  friends: "Evan",
  heard_from: "The website",
  notes: "Can come weeknights",
  grade: "8",
  ...more,
});

const assessment = {
  ...BUILTIN_14U,
  starts_at: "2026-10-25T16:00:00.000Z",
  place: "The gym",
};

test("the confirmation thanks the parent and lists the assessment", () => {
  assert.equal(assessmentSubject(input(), assessment), "You're signed up for 14U assessment!");
  const html = assessmentHtml(input(), assessment, "https://example.com/logo.png");
  assert.match(html, /Hi Jamie, thanks for signing <strong>Sam<\/strong> up for 14U assessment/);
  assert.match(html, /We(?:'|&#39;)ve got everything we need/);
  assert.match(html, /The gym/);
  assert.match(html, /A board member will reach out about the assessment/);
  assert.match(html, /href="https:\/\/omahalightningbasketball\.com\/programs"/);
  assert.match(html, /Omaha Lightning Basketball/);
  assert.match(assessmentText(input(), assessment), /1\. A board member will reach out/);
});

test("saved words replace the originals", () => {
  const t = emailText({
    "assessment.subject": "Got {player} for {assessment}",
    "assessment.intro": "Hello {parent}! {player} is on the list.",
    "assessment.next_steps": "First\nSecond",
    "assessment.closing": "Thanks!\nGo Bolts!",
  });
  assert.equal(assessmentSubject(input(), assessment, t), "Got Sam for 14U assessment");
  const html = assessmentHtml(input(), assessment, "x", t);
  assert.match(html, /Hello Jamie! <strong>Sam<\/strong> is on the list\./);
  assert.match(html, />1<\/div>[\s\S]*First[\s\S]*>2<\/div>[\s\S]*Second/);
  assert.match(html, /Thanks!<br><strong>Go Bolts!<\/strong>/);
});

test("the club notice has the player, parents, answers and a card link", () => {
  assert.equal(assessmentNoticeSubject("Sam Carter"), "New assessment: Sam Carter");
  const text = assessmentNoticeText(input(), assessment, "https://example.com/portal/directory/registrations?tab=waitlist&open=abc");
  assert.match(text, /Player: Sam Carter/);
  assert.match(text, /Birthday: May 1, 2012/);
  assert.match(text, /Assessment: 14U assessment/);
  assert.match(text, /Level: 14U/);
  assert.match(text, /Parent: Jamie Carter · jamie@example\.com · 402-555-0101/);
  assert.match(text, /Homeschooled: yes/);
  assert.match(text, /Experience: Rec league/);
  assert.match(text, /Grade: 8/);
  assert.match(text, /Friends: Evan/);
  assert.match(text, /Heard from: The website/);
  assert.match(text, /Notes: Can come weeknights/);
  assert.match(text, /portal\/directory\/registrations\?tab=waitlist&open=abc/);
});
