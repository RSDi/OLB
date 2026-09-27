// Settings → Sidebar Links: what counts as a link address, and how a typed one
// is cleaned up before it's saved (lib/sidebar-links/url.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSidebarUrl } from "../../lib/sidebar-links/url.ts";

test("keeps full http(s) addresses as typed", () => {
  assert.equal(
    normalizeSidebarUrl("https://schedule.omahalightningbasketball.com/"),
    "https://schedule.omahalightningbasketball.com/"
  );
  assert.equal(normalizeSidebarUrl("  http://example.com/a?b=1  "), "http://example.com/a?b=1");
});

test("adds https:// to a bare domain", () => {
  assert.equal(
    normalizeSidebarUrl("schedule.omahalightningbasketball.com"),
    "https://schedule.omahalightningbasketball.com"
  );
});

test("accepts portal paths", () => {
  assert.equal(normalizeSidebarUrl("/portal/docs"), "/portal/docs");
});

test("rejects anything that isn't a web address", () => {
  for (const bad of ["", "   ", "javascript:alert(1)", "mailto:a@b.com", "//evil.com", "not a url", "schedule", "ftp://x.com"]) {
    assert.equal(normalizeSidebarUrl(bad), null, bad);
  }
});
