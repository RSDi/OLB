// Email templates (lib/teams/email-templates.ts): what Settings → Email
// Templates accepts, and the order the Template list shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTemplate, sortTemplates } from "../../lib/teams/email-templates.ts";

test("a template is trimmed, keeps its line breaks, and needs a name, subject and message", () => {
  assert.deepEqual(cleanTemplate({ name: "  Practice change ", subject: " Practice moved ", body: "\r\nHi,\r\n\r\n{player} practices Thursday.\r\n  " }), {
    name: "Practice change",
    subject: "Practice moved",
    body: "Hi,\n\n{player} practices Thursday.",
  });
  assert.deepEqual(cleanTemplate({ name: " ", subject: "s", body: "b" }), { error: "Give the template a name." });
  assert.deepEqual(cleanTemplate({ name: "n", subject: "", body: "b" }), { error: "Add a subject." });
  assert.deepEqual(cleanTemplate({ name: "n", subject: "s", body: "\n \n" }), { error: "Add a message." });
  assert.ok("error" in cleanTemplate({ name: "n".repeat(81), subject: "s", body: "b" }));
  assert.ok("error" in cleanTemplate({ name: "n", subject: "s".repeat(201), body: "b" }));
  assert.ok("error" in cleanTemplate({ name: "n", subject: "s", body: "b".repeat(4001) }));
  assert.ok(!("error" in cleanTemplate({ name: "n".repeat(80), subject: "s".repeat(200), body: "b".repeat(4000) })));
});

test("the Template list is in name order, ignoring case", () => {
  const list = [{ name: "picture day" }, { name: "Fee reminder" }, { name: "Practice change" }];
  assert.deepEqual(sortTemplates(list).map((t) => t.name), ["Fee reminder", "picture day", "Practice change"]);
  assert.equal(list[0].name, "picture day"); // the original isn't reordered
});
