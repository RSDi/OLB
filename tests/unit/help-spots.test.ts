import { test } from "node:test";
import assert from "node:assert/strict";
import { GUIDE_TOURS, helpSpotsFor, tourStepsFor, type GuideTour } from "../../lib/help/tours.ts";

const superAdmin = { role: "super_admin", status: "approved", isStaff: true, seesFullUi: true } as const;

test("help mode spots: one per on-page element, pointing back at the tour step", () => {
  const tour: GuideTour = {
    id: "t",
    sectionId: "directory",
    title: "T",
    route: "/portal/directory",
    steps: [
      { title: "Welcome", body: "card in the middle" },
      { target: "a", title: "A", body: "a" },
      { target: "nav", sidebar: true, title: "Nav", body: "sidebar" },
      { target: "b", route: "/portal/other", title: "B", body: "other page" },
      { target: "a", title: "A again", body: "dupe" },
      { target: "c", route: "/portal/directory", title: "C", body: "c" },
    ],
  };
  const spots = helpSpotsFor(tour, superAdmin);
  assert.deepEqual(spots.map(s => [s.anchor, s.step]), [["a", 1], ["c", 5]]);
});

test("every spot's step is the same step in the viewer's tour", () => {
  for (const tour of GUIDE_TOURS) {
    const steps = tourStepsFor(tour, superAdmin);
    for (const spot of helpSpotsFor(tour, superAdmin)) {
      assert.equal(steps[spot.step].target, spot.anchor, `${tour.id}: ${spot.anchor}`);
    }
  }
});
