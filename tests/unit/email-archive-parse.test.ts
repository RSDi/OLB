import { test } from "node:test";
import assert from "node:assert/strict";
import { importResponseBody, parseEmailArchiveImport } from "../../lib/email-archive/parse.ts";
import { agentPayloadLeaks } from "../../lib/agent/film.ts";

const base = {
  gmailThreadId: "1a13bbc3cc52c26e",
  sourceMailbox: "Lightning Gmail",
  addedBy: "Jeff's agent",
  messages: [
    {
      gmailMessageId: "19abcdef",
      from: "Lyla Santo <lyla.santo.08@gmail.com>",
      to: ["LightningBasketballOmaha@gmail.com"],
      sentAt: "2026-10-14T18:45:00Z",
      subject: "Fundraising opportunity at Nelson Farm",
      bodyText: "Hi!",
      bodyHtml: "<p>Hi!</p><script>alert(1)</script>",
    },
  ],
};

test("a valid import is accepted and HTML is sanitized", () => {
  const parsed = parseEmailArchiveImport(base);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.gmailThreadId, "1a13bbc3cc52c26e");
  assert.equal(parsed.value.messages[0].bodyHtml.includes("script"), false);
  assert.match(parsed.value.messages[0].bodyHtml, /Hi!/);
  assert.deepEqual(parsed.value.messages[0].to, ["LightningBasketballOmaha@gmail.com"]);
});

test("links may use a board-meeting month", () => {
  const parsed = parseEmailArchiveImport({
    ...base,
    links: [{ month: "2026-10", agendaItemLabel: "Item 4 · Fundraising" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.links[0].month, "2026-10");
  assert.equal(parsed.value.links[0].agendaItemLabel, "Item 4 · Fundraising");
});

test("missing thread id, mailbox, or messages is rejected", () => {
  assert.equal(parseEmailArchiveImport({}).ok, false);
  assert.equal(parseEmailArchiveImport({ gmailThreadId: "1a13bbc3cc52c26e" }).ok, false);
  assert.equal(parseEmailArchiveImport({ gmailThreadId: "1a13bbc3cc52c26e", sourceMailbox: "Lightning Gmail", messages: [] }).ok, false);
});

test("the import response never names storage paths or hashes", () => {
  const body = importResponseBody({
    gmailThreadId: "1a13bbc3cc52c26e",
    url: "/portal/archives/email/1a13bbc3cc52c26e",
    messageCount: 1,
    created: true,
    warnings: [],
  });
  assert.deepEqual(body.thread, {
    gmailThreadId: "1a13bbc3cc52c26e",
    url: "/portal/archives/email/1a13bbc3cc52c26e",
    messageCount: 1,
  });
  assert.deepEqual(agentPayloadLeaks(body), []);
});
