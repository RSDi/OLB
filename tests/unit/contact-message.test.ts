// The public site's Contact form: reading and validating submissions, and the
// email it sends the club (with fetch stubbed out).
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { CLUB_EMAIL, contactMessageProblem, contactRecipient, readContactMessage } from "../../lib/contact/message.ts";
import { sendContactMessageEmail } from "../../lib/notifications/contact-message.ts";

const VALID = { fname: "Pat", lname: "Parent", email: "pat@example.com", message: "Is 12U full?" };

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

test("readContactMessage trims fields and treats missing ones as empty", () => {
  assert.deepEqual(readContactMessage(form({ fname: "  Pat ", email: " pat@example.com\n", message: "Hi" })), {
    fname: "Pat",
    lname: "",
    email: "pat@example.com",
    message: "Hi",
  });
});

test("contactMessageProblem accepts a complete message", () => {
  assert.equal(contactMessageProblem(VALID), null);
});

test("contactMessageProblem requires every field", () => {
  for (const field of ["fname", "lname", "email", "message"] as const) {
    assert.equal(contactMessageProblem({ ...VALID, [field]: "" }), "Please fill in all required fields.");
  }
});

test("contactMessageProblem rejects a malformed email", () => {
  assert.equal(contactMessageProblem({ ...VALID, email: "pat@example" }), "Please enter a valid email address.");
  assert.equal(contactMessageProblem({ ...VALID, email: "pat example.com" }), "Please enter a valid email address.");
});

test("contactMessageProblem caps the message length", () => {
  assert.match(contactMessageProblem({ ...VALID, message: "x".repeat(10_001) }) ?? "", /10,000/);
});

test("contactRecipient uses CONTACT_EMAIL, falling back to the club inbox when unset or blank", () => {
  assert.equal(contactRecipient({}), CLUB_EMAIL);
  assert.equal(contactRecipient({ CONTACT_EMAIL: "  " }), CLUB_EMAIL);
  assert.equal(contactRecipient({ CONTACT_EMAIL: "coach@example.com" }), "coach@example.com");
});

// ── sendContactMessageEmail ──

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  delete process.env.MAIL_FROM;
  process.env.RESEND_API_KEY = "re_test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

test("sendContactMessageEmail reports failure without an API key, sending nothing", async () => {
  delete process.env.RESEND_API_KEY;
  assert.equal(await sendContactMessageEmail(VALID, CLUB_EMAIL), false);
  assert.equal(calls.length, 0);
});

test("sendContactMessageEmail mails the recipient with Reply-To set to the sender", async () => {
  assert.equal(await sendContactMessageEmail(VALID, CLUB_EMAIL), true);
  assert.equal(calls.length, 1);
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.to, [CLUB_EMAIL]);
  assert.equal(body.reply_to, "pat@example.com");
  assert.equal(body.subject, "Website message from Pat Parent");
});

test("sendContactMessageEmail escapes what the visitor typed", async () => {
  await sendContactMessageEmail({ ...VALID, fname: "<b>Pat</b>", message: "<script>alert(1)</script>" }, CLUB_EMAIL);
  const { html } = JSON.parse(String(calls[0].init.body));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("&lt;b&gt;Pat&lt;/b&gt;"));
});

test("sendContactMessageEmail reports a failed send", async () => {
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await sendContactMessageEmail(VALID, CLUB_EMAIL), false);
  } finally {
    console.error = originalError;
  }
});
