// Who the site's emails come from and where replies go
// (lib/notifications/mail.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailFrom, mailReplyTo } from "../../lib/notifications/mail.ts";

test("the sender comes from MAIL_FROM, with a blank one treated as unset", () => {
  assert.equal(mailFrom("OLB Portal", { MAIL_FROM: "Club <registration@example.org>" }), "Club <registration@example.org>");
  assert.equal(mailFrom("OLB Portal", { MAIL_FROM: "  " }), "OLB Portal <onboarding@resend.dev>");
  assert.equal(mailFrom(undefined, {}), "Omaha Lightning Basketball <onboarding@resend.dev>");
});

test("replies go to the club's Gmail unless MAIL_REPLY_TO says otherwise", () => {
  assert.equal(mailReplyTo({}), "LightningBasketballOmaha@gmail.com");
  assert.equal(mailReplyTo({ MAIL_REPLY_TO: " " }), "LightningBasketballOmaha@gmail.com");
  assert.equal(mailReplyTo({ MAIL_REPLY_TO: "treasurer@example.org" }), "treasurer@example.org");
});
