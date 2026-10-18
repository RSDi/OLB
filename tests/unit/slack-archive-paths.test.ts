import { test } from "node:test";
import assert from "node:assert/strict";
import { messageHref, messageTsFromHash } from "../../lib/slack-archive/anchors.ts";
import { mapLegacySlackArchivePath } from "../../lib/slack-archive/paths.ts";

test("old Slack Archive paths map onto Archives, including album as a sibling tab", () => {
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive"), "/portal/archives/slack");
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive/C0BOLT"), "/portal/archives/slack/C0BOLT");
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive/search"), "/portal/archives/slack/search");
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive/exceptions"), "/portal/archives/slack/exceptions");
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive/album"), "/portal/archives/album");
  assert.equal(mapLegacySlackArchivePath("/portal/slack-archive/media/C1/a.jpg"), "/portal/archives/slack/media/C1/a.jpg");
  assert.equal(mapLegacySlackArchivePath("/portal/archives/slack"), null);
});

test("a message link still uses #msg-<ts> so old hashes keep working", () => {
  const href = messageHref("C0BOLT", "1695321234.123456");
  assert.equal(href, "/portal/archives/slack/C0BOLT#msg-1695321234.123456");
  assert.equal(messageTsFromHash(new URL(`https://x.org${href}`).hash), "1695321234.123456");
});
