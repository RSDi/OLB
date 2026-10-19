// Public /mockups click-throughs: no login, noindex, no stored data, exact copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_SLUGS } from "../../lib/website/content.ts";

const root = join(import.meta.dirname, "../..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const ASK =
  "Does your player have any other commitments this season, like football, debate, another sport or activity, that might pull them away from practices or games? We ask because consistent attendance matters to the whole team.";
const YES_FOLLOW_UP =
  "Thanks for letting us know! A coach or board member will review this and reach out to learn more. Is there anything you already know about your schedule that would help us work through it together?";

test("/mockups is public: middleware never gates it", () => {
  const mw = src("middleware.ts");
  assert.match(mw, /including \/mockups/);
  assert.equal(mw.includes("/mockups/:path*"), false);
  assert.equal(mw.includes('path.startsWith("/mockups")'), false);
  assert.match(mw, /matcher: \["\/portal\/:path\*", "\/login", "\/pair\/:path\*"\]/);
});

test("/mockups pages are noindexed and carry the mock-up banner", () => {
  const layout = src("app/(site)/mockups/layout.tsx");
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/);
  assert.match(layout, /Mock-up, not live/);
});

test("registration-commitments uses the asked-for copy and a staff flag", () => {
  const page = src("app/(site)/mockups/registration-commitments/CommitmentsClickThrough.tsx");
  assert.equal(page.includes(ASK), true);
  assert.equal(page.includes(YES_FOLLOW_UP), true);
  assert.match(page, />\s*Yes\s*</);
  assert.match(page, />\s*No\s*</);
  assert.match(page, />\s*Commitments\s*</);
  assert.match(page, /Activity name and conflicting days\/times/);
});

test("mock-ups store nothing and never call registration, the portal, or the database", () => {
  const files = [
    "app/(site)/mockups/layout.tsx",
    "app/(site)/mockups/page.tsx",
    "app/(site)/mockups/registration-commitments/page.tsx",
    "app/(site)/mockups/registration-commitments/CommitmentsClickThrough.tsx",
  ];
  for (const file of files) {
    const text = src(file);
    assert.equal(text.includes("createAdminClient"), false, file);
    assert.equal(text.includes("createServerClient"), false, file);
    assert.equal(text.includes("from \"@supabase"), false, file);
    assert.equal(text.includes("use server"), false, file);
    assert.equal(text.includes("fetch("), false, file);
    assert.equal(text.includes("localStorage"), false, file);
    assert.equal(text.includes("player-registration"), false, file);
    assert.equal(text.includes("portal/directory/registrations"), false, file);
  }
  assert.equal(RESERVED_SLUGS.includes("mockups"), true);
});
