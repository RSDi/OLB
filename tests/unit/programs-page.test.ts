import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { programPresentation } from "../../lib/website/programs.ts";

test("program titles drop Waitlisted and get the mockup pills", () => {
  const elementary = programPresentation("8U-12U Competitive (Waitlisted)");
  assert.deepEqual(elementary, {
    title: "8U-12U Competitive",
    pill: { label: "Closed for 2026-27", tone: "closed" },
    muted: true,
  });
  const fourteen = programPresentation("14U Competitive (Waitlisted)");
  assert.deepEqual(fourteen, {
    title: "14U Competitive",
    pill: { label: "Assessments open · 2 spots", tone: "open" },
  });
  const hs = programPresentation("16U-18U Competitive");
  assert.deepEqual(hs, {
    title: "16U-18U Competitive",
    pill: { label: "Closed for 2026-27", tone: "closed" },
    muted: true,
  });
});

test("the Programs page shows the 14U button only and no waitlist notice", () => {
  const page = readFileSync(join(import.meta.dirname, "../../app/(site)/programs/page.tsx"), "utf8");
  assert.match(page, /programPresentation/);
  assert.match(page, /programs\.button\.assessments/);
  assert.doesNotMatch(page, /programs\.notice/);
  assert.doesNotMatch(page, /programs\.button\.waitlist/);
  assert.doesNotMatch(page, /programs\.button\.register/);
});
