// Headline size for registration/assessment emails (lib/teams/email-headline.ts):
// long lines shrink so they stay readable on a phone, including in Gmail.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMAIL_HEADLINE_CLASS,
  EMAIL_HEADLINE_MAX_PX,
  EMAIL_HEADLINE_MIN_PX,
  emailHeadlineFontSize,
  emailHeadlineHtml,
  emailHeadlineInlineStyle,
  emailHeadlineMediaCss,
} from "../../lib/teams/email-headline.ts";
import { assessmentHtml } from "../../lib/teams/assessment-receipt.ts";
import { receipt, receiptHtml } from "../../lib/teams/registration-receipt.ts";
import { emailText } from "../../lib/teams/registration-email-text.ts";
import { BUILTIN_14U } from "../../lib/onboarding/assessments.ts";
import type { RegistrationInput } from "../../lib/teams/registration-form.ts";
import type { WaitlistInput } from "../../lib/onboarding/waitlist-form.ts";

test("short headlines stay at 32px; longer ones scale down to 22px", () => {
  assert.equal(emailHeadlineFontSize("Welcome to Lightning!"), EMAIL_HEADLINE_MAX_PX);
  assert.equal(emailHeadlineFontSize("x".repeat(24)), EMAIL_HEADLINE_MAX_PX);
  const mid = emailHeadlineFontSize("x".repeat(30));
  assert.ok(mid < EMAIL_HEADLINE_MAX_PX && mid > EMAIL_HEADLINE_MIN_PX);
  assert.equal(emailHeadlineFontSize("You're signed up for 14U assessment!"), EMAIL_HEADLINE_MIN_PX);
  assert.equal(emailHeadlineFontSize("You're signed up for the 14U assessment!"), EMAIL_HEADLINE_MIN_PX);
  assert.equal(emailHeadlineFontSize("x".repeat(80)), EMAIL_HEADLINE_MIN_PX);
});

test("the markup uses an inline size and a 600px media rule", () => {
  const headline = "You're signed up for 14U assessment!";
  const html = emailHeadlineHtml(headline);
  assert.match(html, new RegExp(`class="${EMAIL_HEADLINE_CLASS}"`));
  assert.match(html, /font-size:22px/);
  assert.match(html, /font-weight:800/);
  assert.match(emailHeadlineInlineStyle(headline), /font-size:22px/);
  const css = emailHeadlineMediaCss(headline);
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /font-size:22px!important/);
  assert.match(emailHeadlineHtml("<b>"), /&lt;b&gt;/);
});

test("the receipt and assessment emails share the helper, so the Settings preview matches", () => {
  const assessmentHeadline = "You're signed up for 14U assessment!";
  const html = assessmentHtml(
    { parent_first: "Jamie", athlete_first: "Sam" } as WaitlistInput,
    { ...BUILTIN_14U, starts_at: "2026-10-25T16:00:00.000Z", place: "The gym" },
    "https://example.com/logo.png",
  );
  assert.ok(html.includes(`<style>${emailHeadlineMediaCss(assessmentHeadline)}</style>`));
  assert.ok(html.includes(emailHeadlineHtml(assessmentHeadline)));

  const short = emailText({ "assessment.headline": "You're in!" });
  const shortHtml = assessmentHtml(
    { parent_first: "Jamie", athlete_first: "Sam" } as WaitlistInput,
    { ...BUILTIN_14U },
    "x",
    short,
  );
  assert.ok(shortHtml.includes(emailHeadlineHtml("You're in!")));
  assert.match(shortHtml, /font-size:32px/);

  const r = receipt([{ athlete_first: "Sam", athlete_last: "Carter", fee_tier: "8u-12u - $375.00", needs_uniform: true, payment_option: "Venmo" } as RegistrationInput]);
  const receiptHeadline = "You're registered for the 2026–27 Lightning season!";
  const receiptMarkup = receiptHtml(r, { email: "jamie@example.com", first: "Jamie" }, { logoUrl: "x", checkAddress: [] });
  assert.ok(receiptMarkup.includes(emailHeadlineHtml(receiptHeadline)));
  assert.match(receiptMarkup, /font-size:22px/);
});
