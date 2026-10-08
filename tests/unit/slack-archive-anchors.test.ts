// Unit tests for links to one archived message, which the channel page
// scrolls to and highlights.
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageAnchorId, messageHref, messageTsFromHash } from "../../lib/slack-archive/anchors.ts";

test("a message link names the channel and the message", () => {
  assert.equal(messageAnchorId("1695321234.123456"), "msg-1695321234.123456");
  assert.equal(messageHref("C0BOLT", "1695321234.123456"), "/portal/slack-archive/C0BOLT#msg-1695321234.123456");
});

test("the linked message is read back from the URL hash", () => {
  assert.equal(messageTsFromHash("#msg-1695321234.123456"), "1695321234.123456");
  assert.equal(messageTsFromHash(new URL(`https://x.org${messageHref("C0BOLT", "1.2")}`).hash), "1.2");
});

test("anything else in the hash links to no message", () => {
  for (const hash of ["", "#", "#day-2026-09-19", "#msg-", "#msg-abc", "#msg-1695321234", "#msg-1.2.3", "#msg-1.2<script>"]) {
    assert.equal(messageTsFromHash(hash), null, hash);
  }
});
