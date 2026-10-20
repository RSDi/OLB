// Public /mockups click-throughs: no login, noindex, no stored data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESERVED_SLUGS } from "../../lib/website/content.ts";

const root = join(import.meta.dirname, "../..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

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

test("mock-ups store nothing and never call registration, the portal, or the database", () => {
  const files = ["app/(site)/mockups/layout.tsx", "app/(site)/mockups/page.tsx"];
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
