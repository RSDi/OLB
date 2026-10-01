// Settings → Sidebar Links: what counts as a link address, and how a typed one
// is cleaned up before it's saved (lib/sidebar-links/url.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canOpenInFrame,
  normalizeSidebarUrl,
  refusesFraming,
  sidebarLinkMode,
} from "../../lib/sidebar-links/url.ts";

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

test("a link opens in a new tab, the same tab, or inside the portal", () => {
  assert.equal(sidebarLinkMode({ open_in_new_tab: true, open_in_frame: false }), "new_tab");
  assert.equal(sidebarLinkMode({ open_in_new_tab: false, open_in_frame: false }), "same_tab");
  assert.equal(sidebarLinkMode({ open_in_new_tab: false, open_in_frame: true }), "frame");
});

test("only outside sites open inside the portal", () => {
  assert.equal(canOpenInFrame("https://schedule.omahalightningbasketball.com/"), true);
  assert.equal(canOpenInFrame("http://example.com"), true);
  assert.equal(canOpenInFrame("/portal/docs"), false);
});

const HOST = "olb.example.com";
const h = (xFrameOptions: string | null, contentSecurityPolicy: string | null) => ({
  xFrameOptions,
  contentSecurityPolicy,
});

test("a site with no framing rules can be framed", () => {
  assert.equal(refusesFraming(h(null, null), HOST), false);
  // The schedule site's policy says nothing about frames.
  assert.equal(refusesFraming(h(null, "default-src 'none'; img-src 'self' data:; form-action 'self'"), HOST), false);
});

test("X-Frame-Options DENY or SAMEORIGIN refuses", () => {
  assert.equal(refusesFraming(h("DENY", null), HOST), true);
  assert.equal(refusesFraming(h("SAMEORIGIN", null), HOST), true);
  assert.equal(refusesFraming(h("ALLOW-FROM https://olb.example.com", null), HOST), false);
});

test("frame-ancestors decides when present, over X-Frame-Options", () => {
  assert.equal(refusesFraming(h(null, "frame-ancestors 'none'"), HOST), true);
  assert.equal(refusesFraming(h(null, "default-src *; frame-ancestors 'self'"), HOST), true);
  assert.equal(refusesFraming(h(null, "frame-ancestors https://other.com"), HOST), true);
  assert.equal(refusesFraming(h("DENY", "frame-ancestors *"), HOST), false);
  assert.equal(refusesFraming(h(null, "frame-ancestors 'self' https://olb.example.com"), HOST), false);
  assert.equal(refusesFraming(h(null, "frame-ancestors *.example.com"), HOST), false);
  assert.equal(refusesFraming(h(null, "frame-ancestors https:"), HOST), false);
});
