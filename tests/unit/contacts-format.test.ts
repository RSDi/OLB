// Tap-to-call links for External Contacts (app/portal/contacts/_shared/format.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { telHref } from "../../app/portal/contacts/_shared/format.ts";

test("a phone becomes a tel: link, with an extension dialed after a pause", () => {
  assert.equal(telHref("515-304-5050"), "tel:5153045050");
  assert.equal(telHref("+1 (402) 555-0100"), "tel:+14025550100");
  assert.equal(telHref("913-341-6000 Ext 2"), "tel:9133416000,2");
  assert.equal(telHref("913-341-6000 ext. 12"), "tel:9133416000,12");
  assert.equal(telHref("913-341-6000 x2"), "tel:9133416000,2");
  assert.equal(telHref("12"), null);
  assert.equal(telHref(null), null);
});
