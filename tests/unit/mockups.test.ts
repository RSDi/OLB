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
const NOTE_LABEL = "Activity name and conflicting days/times (optional)";

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
  const css = src("app/(site)/mockups/mockups.module.css");
  assert.match(css, /top:\s*var\(--header-height\)/);
  assert.equal(css.includes("#fbcb44"), false);
  assert.equal((css.match(/#fbcb43/g) ?? []).length >= 2, true);
});

test("registration-commitments uses the asked-for copy and a staff flag", () => {
  const page = src("app/(site)/mockups/registration-commitments/CommitmentsClickThrough.tsx");
  assert.equal(page.includes(ASK), true);
  assert.equal(page.includes(YES_FOLLOW_UP), true);
  assert.equal(page.includes("debate, or another sport"), false);
  assert.equal(page.includes("<p>{ASK}</p>"), true);
  assert.equal(page.includes("<p>{YES_FOLLOW_UP}</p>"), true);
  assert.equal(page.includes("<h2>Registration commitments</h2>"), false);
  assert.equal(page.includes("<h4>{ASK}</h4>"), false);
  assert.equal(page.includes("<h4>{YES_FOLLOW_UP}</h4>"), false);
  assert.match(page, />\s*Yes\s*</);
  assert.match(page, />\s*No\s*</);
  assert.equal(page.includes(NOTE_LABEL), true);
  assert.match(page, />\s*Commitments\s*</);
  assert.equal(page.includes("Other commitment: Yes"), false);
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
