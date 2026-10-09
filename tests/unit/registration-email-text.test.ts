// The registration emails' editable words (lib/teams/registration-email-text.ts):
// originals, saved changes, tokens, and what a save keeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEmailText, codeEmail, emailText, fillTokens, REGISTRATION_EMAIL_FIELDS } from "../../lib/teams/registration-email-text.ts";
import { receipt, receiptHtml, receiptSubject, receiptText } from "../../lib/teams/registration-receipt.ts";
import type { RegistrationInput } from "../../lib/teams/registration-form.ts";

test("every field starts from its original, and a saved change replaces it", () => {
  const t = emailText();
  for (const f of REGISTRATION_EMAIL_FIELDS) assert.equal(t[f.key], f.original);
  assert.equal(emailText({ "receipt.headline": "Welcome!" })["receipt.headline"], "Welcome!");
});

test("tokens fill in, and an empty name leaves no gap", () => {
  assert.equal(fillTokens("Hi {parent}, thanks for {PLAYER}.", { parent: "Anna", player: "Weston" }), "Hi Anna, thanks for Weston.");
  assert.equal(fillTokens("Hi {parent}, thanks", { parent: "" }), "Hi, thanks");
  assert.equal(fillTokens("Keep {unknown}", {}), "Keep {unknown}");
});

test("a save is trimmed and checked; the original wording or a cleared field goes back to the original", () => {
  assert.deepEqual(cleanEmailText("receipt.headline", "  Welcome!  "), { value: "Welcome!" });
  assert.deepEqual(cleanEmailText("receipt.headline", "You're registered!"), { value: null });
  assert.ok("error" in cleanEmailText("receipt.headline", "   "));
  assert.deepEqual(cleanEmailText("receipt.uniform_note", ""), { value: "" });
  assert.ok("error" in cleanEmailText("receipt.headline", "x".repeat(81)));
  assert.ok("error" in cleanEmailText("nope.key", "x"));
});

test("the receipt and the code email use the saved words", () => {
  const r = receipt([{ athlete_first: "Weston", athlete_last: "Douglas", fee_tier: "8u-12u - $375.00", needs_uniform: true, payment_option: "Venmo" } as RegistrationInput]);
  const t = emailText({
    "receipt.subject": "Welcome, {player}!",
    "receipt.intro": "Hello {parent}! {player} is in.",
    "receipt.uniform_note": "",
    "receipt.next_steps": "First thing\n\nSecond thing",
    "receipt.closing": "Thanks!\nGo Bolts!",
  });
  assert.equal(receiptSubject(r, t), "Welcome, Weston!");
  const html = receiptHtml(r, { email: "a@example.com", first: "Anna" }, { logoUrl: "x", checkAddress: [] }, t);
  assert.match(html, /Hello Anna! <strong>Weston<\/strong> is in\./);
  assert.doesNotMatch(html, /Uniform sizes/);
  assert.match(html, />1<\/div>[\s\S]*First thing[\s\S]*>2<\/div>[\s\S]*Second thing/);
  assert.match(html, /Thanks!<br><strong>Go Bolts!<\/strong>/);
  assert.match(receiptText(r, { email: "a@example.com", first: "Anna" }, { checkAddress: [] }, t), /1\. First thing\n2\. Second thing/);
  const code = codeEmail("123456", emailText({ "code.subject": "Code: {code}" }));
  assert.equal(code.subject, "Code: 123456");
  assert.match(code.html, /123456/);
});
