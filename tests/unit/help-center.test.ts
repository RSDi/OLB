// The Help Center's how-tos (lib/help/help-center.ts) against the guide and
// tours: every how-to names a real guide section and tour, its tour step is
// in that tour, and it reaches nobody its guide section doesn't.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_SECTIONS, canSeeGuideSection } from "../../lib/help/guide.ts";
import { getTour, tourStepsFor } from "../../lib/help/tours.ts";
import { HOW_TOS, HOW_TO_TOPICS, canSeeHowTo, howToTour, howTosFor, matchesHowTo } from "../../lib/help/help-center.ts";

const superAdmin = { role: "super_admin", status: "approved", isStaff: true, seesFullUi: true } as const;
const parent = { role: "member", status: "approved", isStaff: false } as const;

test("ids are unique and topics are known", () => {
  assert.equal(new Set(HOW_TOS.map(h => h.id)).size, HOW_TOS.length);
  for (const h of HOW_TOS) assert.ok(HOW_TO_TOPICS.includes(h.topic), h.id);
});

test("every how-to names a real guide section, tour and tour step", () => {
  const ids = new Set(GUIDE_SECTIONS.map(s => s.id));
  for (const h of HOW_TOS) {
    assert.ok(ids.has(h.sectionId), `${h.id}: no guide section ${h.sectionId}`);
    if (!h.tourId) continue;
    const tour = getTour(h.tourId);
    assert.ok(tour, `${h.id}: no tour ${h.tourId}`);
    if (h.tourTarget) {
      assert.ok(tour!.steps.some(s => s.target === h.tourTarget), `${h.id}: ${h.tourId} has no step at ${h.tourTarget}`);
      const start = howToTour(h, superAdmin);
      assert.equal(tourStepsFor(tour!, superAdmin)[start!.step!].target, h.tourTarget, h.id);
    }
  }
});

test("a how-to reaches nobody its guide section doesn't", () => {
  for (const h of HOW_TOS) {
    const section = GUIDE_SECTIONS.find(s => s.id === h.sectionId)!;
    for (const v of [superAdmin, parent, null]) {
      if (canSeeHowTo(h, v)) assert.ok(canSeeGuideSection(section, v), `${h.id}`);
    }
  }
  const forParent = howTosFor(parent).map(h => h.id);
  assert.ok(forParent.includes("find-contact"));
  assert.ok(!forParent.includes("approve-access"));
});

test("search matches every word, ignoring bold marks", () => {
  const h = HOW_TOS.find(x => x.id === "forgot-password")!;
  assert.ok(matchesHowTo(h, "forgot password"));
  assert.ok(matchesHowTo(h, "RESET"));
  assert.ok(!matchesHowTo(h, "password jersey"));
  assert.ok(matchesHowTo(h, "   "));
});
