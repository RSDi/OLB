// The emails sent when a family registers (lib/teams/registration-receipt.ts):
// who gets the receipt (only the person who filled the form in), and what
// the receipt and the club's notice say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clubNoticeSubject, clubNoticeText, receipt, receiptHtml, receiptSubject, receiptText, registrant } from "../../lib/teams/registration-receipt.ts";
import type { RegistrationInput } from "../../lib/teams/registration-form.ts";

const input = (more: Partial<RegistrationInput> = {}): RegistrationInput =>
  ({
    athlete_first: "Sam", athlete_last: "Carter", athlete_dob: "2009-05-01", first_season: true, athlete_phone: "", athlete_email: "",
    homeschool_affirm: true, needs_uniform: true, needs_grays: true, fee_tier: "16u-18u - $525.00",
    address_line1: "", address_line2: "", city: "", state: "", zip: "", directory_optin: true,
    father_first: "Chris", father_last: "Carter", father_email: "chris@example.com", father_phone: "402-555-0100", father_volunteer: [], father_volunteer_other: "",
    mother_first: "Jamie", mother_last: "Carter", mother_email: "Jamie@Example.com", mother_phone: "", mother_volunteer: [], mother_volunteer_other: "",
    waiver_agreed: true, printed_name: "Jamie Carter", signature_mode: "draw", signature_name: "", signature_image: "", donation_interest: false, payment_option: "Venmo",
    ...more,
  }) as RegistrationInput;

test("the receipt goes to one person: whoever filled the form in", () => {
  // The email they confirmed with the code, even though Dad is listed first.
  assert.deepEqual(registrant(input(), "jamie@example.com"), { email: "jamie@example.com", first: "Jamie" });
  // No code: the parent who signed the waiver.
  assert.deepEqual(registrant(input(), null), { email: "jamie@example.com", first: "Jamie" });
  assert.deepEqual(registrant(input({ printed_name: "chris  carter" }), null), { email: "chris@example.com", first: "Chris" });
  // Signed by someone else: the first parent email on the form.
  assert.deepEqual(registrant(input({ printed_name: "Grandma Carter" }), null), { email: "chris@example.com", first: "Chris" });
  assert.equal(registrant(input({ father_email: "", mother_email: "n/a" }), null), null);
});

test("the receipt lists each player, the total and how to pay", () => {
  const r = receipt([input(), input({ athlete_first: "Evan", fee_tier: "8u-12u - $375.00", needs_uniform: false, needs_grays: null })]);
  assert.equal(r.totalCents, 90000);
  assert.equal(receiptSubject(r), "You're registered: Sam and Evan for the 2026-27 season");
  const who = { email: "jamie@example.com", first: "Jamie" };
  const html = receiptHtml(r, who, { logoUrl: "https://example.com/logo.png", checkAddress: [] });
  assert.match(html, /Hi Jamie, thanks for registering <strong>Sam and Evan<\/strong>/);
  assert.match(html, /16u–18u · New uniform: yes · Grays: yes/);
  assert.match(html, /8u–12u · New uniform: no</);
  assert.match(html, /\$900\.00/);
  assert.match(html, /venmo\.com\/u\/OmahaLightning-Basketball/);
  assert.match(html, /reply to this email for the mailing address/);
  assert.match(receiptHtml(r, who, { logoUrl: "x", checkAddress: ["Treasurer", "1 Main St"] }), /Treasurer<br>1 Main St/);
  assert.match(receiptText(r, who, { checkAddress: [] }), /Total: \$900\.00/);
  // What happens next: placement, then Slack. No portal sign-in yet.
  assert.match(html, /places Sam and Evan on teams/);
  assert.match(html, /joining our team communication platform, Slack/);
  assert.doesNotMatch(html, /portal/i);
  assert.match(receiptText(r, who, { checkAddress: [] }), /2\. A board member will contact you/);
  // Names are escaped.
  assert.match(receiptHtml(receipt([input({ athlete_first: "<b>" })]), who, { logoUrl: "x", checkAddress: [] }), /&lt;b&gt;/);
});

test("the club's notice says who, how much and where to review it", () => {
  const r = receipt([input()]);
  assert.equal(clubNoticeSubject(r), "New registration: Sam Carter");
  const text = clubNoticeText(r, input(), { email: "jamie@example.com", first: "Jamie" }, true, "https://example.com/portal/directory/registrations");
  assert.match(text, /Sam Carter \(16u–18u · New uniform: yes · Grays: yes\): \$525\.00/);
  assert.match(text, /Registered by: jamie@example\.com \(email confirmed\)/);
  assert.match(text, /Father: Chris Carter · chris@example\.com · 402-555-0100/);
  assert.match(text, /portal\/directory\/registrations/);
});

test("a saved registration's receipt goes back to the family; any other address is a test", async () => {
  const { savedInput, registrationEmails, greetingFor } = await import("../../lib/teams/registration-receipt.ts");
  const saved = savedInput({
    first_name: "Weston",
    last_name: "Douglas",
    extra: {
      fee_tier: "8u-12u - $375.00",
      payment_option: "Venmo",
      needs_uniform: true,
      father: { first: "Brad", last: "Douglas", email: "brad@example.com" },
      mother: { first: "Anna", last: "Douglas", email: "anna@example.com" },
      printed_name: "Anna Douglas",
      email_confirmed: "anna@example.com",
    },
  });
  assert.deepEqual(registrant(saved, "anna@example.com"), { email: "anna@example.com", first: "Anna" });
  assert.deepEqual(registrationEmails(saved, "anna@example.com").sort(), ["anna@example.com", "anna@example.com", "brad@example.com"].sort());
  assert.ok(!registrationEmails(saved, "anna@example.com").includes("tester@example.com"));
  assert.equal(greetingFor(saved, "BRAD@example.com", "Anna"), "Brad");
  assert.equal(greetingFor(saved, "tester@example.com", "Anna"), "Anna");
  assert.equal(receipt([saved]).totalCents, 37500);
});
