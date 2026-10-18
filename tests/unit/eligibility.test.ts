import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_AGE_CAPS,
  DEFAULT_SEASON_ENDS_ON,
  ageOnDate,
  agesOutLabel,
  formatAgesOutDate,
  isEligibleForLevel,
  lowestEligibleLevel,
  playerEligibility,
  practiceDaysOverlap,
  rosterAgeOut,
  swingKind,
  turnsAgeOn,
  weekendsSharedWith,
} from "../../lib/teams/eligibility.ts";

const END = DEFAULT_SEASON_ENDS_ON; // 2026-12-31
const caps = DEFAULT_AGE_CAPS;

test("age on the season end date counts a birthday on that day", () => {
  assert.equal(ageOnDate("2011-12-31", END), 15);
  assert.equal(ageOnDate("2011-12-30", END), 15);
  assert.equal(ageOnDate("2012-01-01", END), 14);
  assert.equal(ageOnDate("2014-06-15", END), 12);
  assert.equal(ageOnDate(null, END), null);
});

test("14U must not turn 15 on or before the end date", () => {
  const u14 = caps.find((c) => c.age_group === "14U")!;
  assert.equal(isEligibleForLevel("2012-01-01", END, u14), true);
  assert.equal(isEligibleForLevel("2011-12-31", END, u14), false);
  assert.equal(isEligibleForLevel("2011-10-25", END, u14), false);
});

test("12U must not turn 13; 10U must not turn 11", () => {
  const u12 = caps.find((c) => c.age_group === "12U")!;
  const u10 = caps.find((c) => c.age_group === "10U")!;
  assert.equal(isEligibleForLevel("2014-01-01", END, u12), true);
  assert.equal(isEligibleForLevel("2013-12-31", END, u12), false);
  assert.equal(isEligibleForLevel("2016-01-01", END, u10), true);
  assert.equal(isEligibleForLevel("2015-12-31", END, u10), false);
});

test("lowest eligible level is the youngest cap they still fit", () => {
  assert.equal(lowestEligibleLevel("2015-06-01", END, caps), "12U");
  assert.equal(lowestEligibleLevel("2012-06-01", END, caps), "14U");
  assert.equal(lowestEligibleLevel("2017-06-01", END, caps), "10U");
  assert.equal(lowestEligibleLevel("2007-06-01", END, caps), null);
  assert.equal(lowestEligibleLevel(null, END, caps), null);
});

test("a player rostered too high gets Ages out on their birthday", () => {
  const flag = rosterAgeOut("2011-10-25", "14U", END, caps);
  assert.deepEqual(flag, { level: "14U", on: "2026-10-25" });
  assert.equal(agesOutLabel(flag!.on), "Ages out 10/25/26");
  assert.equal(formatAgesOutDate("2026-10-25"), "10/25/26");
  assert.equal(rosterAgeOut("2012-01-01", "14U", END, caps), null);
  assert.equal(turnsAgeOn("2011-10-25", 15), "2026-10-25");
});

test("playerEligibility puts the chip and the lowest level together", () => {
  const out = playerEligibility("2011-10-25", "14U", END, caps);
  assert.equal(out.ageAtSeasonEnd, 15);
  assert.equal(out.lowestLevel, "16U");
  assert.deepEqual(out.agesOut, { level: "14U", on: "2026-10-25" });
});

test("swing up lists younger eligible players; swing down lists older still-eligible ones", () => {
  const target = { teamId: "14w", ageGroup: "14U" };
  assert.equal(
    swingKind({ dob: "2014-03-01", teamId: "12g", teamAgeGroup: "12U" }, target, END, caps),
    "up"
  );
  assert.equal(
    swingKind({ dob: "2012-03-01", teamId: "16b", teamAgeGroup: "16U" }, target, END, caps),
    "down"
  );
  assert.equal(
    swingKind({ dob: "2011-03-01", teamId: "16b", teamAgeGroup: "16U" }, target, END, caps),
    null
  );
  assert.equal(
    swingKind({ dob: "2013-03-01", teamId: "14b", teamAgeGroup: "14U" }, target, END, caps),
    null
  );
  assert.equal(
    swingKind({ dob: "2014-03-01", teamId: null, teamAgeGroup: null }, target, END, caps),
    "up"
  );
  assert.equal(
    swingKind({ dob: "2013-03-01", teamId: "14w", teamAgeGroup: "14U" }, target, END, caps),
    null
  );
});

test("same-weekend schedule marks a player's own team when both play that weekend", () => {
  const weekends = [
    { id: "w1", label: "Regionals", teamIds: ["12g", "14w"] },
    { id: "w2", label: "Local", teamIds: ["14w", "16b"] },
  ];
  assert.equal(weekendsSharedWith("12g", "14w", weekends).map((w) => w.label).join(), "Regionals");
  assert.equal(weekendsSharedWith("10u", "14w", weekends).length, 0);
  assert.equal(weekendsSharedWith("14w", "14w", weekends).length, 0);
});

test("practice day overlap only fires when both teams name the same weekday", () => {
  assert.equal(practiceDaysOverlap(["Mon 6-8pm"], ["Monday 5pm", "Wed 6pm"]), true);
  assert.equal(practiceDaysOverlap(["Tue 6pm"], ["Thursday 6pm"]), false);
  assert.equal(practiceDaysOverlap(["6-8pm"], ["6-8pm"]), false);
});
