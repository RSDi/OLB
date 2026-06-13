// Unit tests for schedule-conflict detection — the time-overlap logic is the
// risky part (off-by-one at touching edges, all-day handling, space matching),
// plus multi-date (recurring) targets that can clash on any of their dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findConflicts,
  windowsOverlap,
  spacesFromLocation,
  timeFromTimestamp,
  dateFromTimestamp,
  type ConflictCandidate,
} from "../../lib/requests/conflicts.ts";

const gymEvent: ConflictCandidate = {
  id: "e1",
  title: "Youth Basketball",
  source: "event",
  spaces: ["Gym"],
  date: "2026-08-20",
  start: "18:00",
  end: "20:00",
};

test("overlapping window on the same space/date is a conflict", () => {
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-20"], start: "19:00", end: "21:00" }, [gymEvent]);
  assert.equal(c.length, 1);
  assert.equal(c[0].id, "e1");
  assert.equal(c[0].date, "2026-08-20");
  assert.equal(c[0].when, "6:00 PM–8:00 PM");
});

test("touching edges do NOT conflict (one ends when the other starts)", () => {
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-20"], start: "20:00", end: "22:00" }, [gymEvent]);
  assert.equal(c.length, 0);
});

test("different space does not conflict", () => {
  const c = findConflicts({ spaces: ["Kitchen"], dates: ["2026-08-20"], start: "18:30", end: "19:30" }, [gymEvent]);
  assert.equal(c.length, 0);
});

test("different date does not conflict", () => {
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-21"], start: "18:30", end: "19:30" }, [gymEvent]);
  assert.equal(c.length, 0);
});

test("a missing time window is treated as all-day → conflicts that day", () => {
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-20"], start: null, end: null }, [gymEvent]);
  assert.equal(c.length, 1);
});

test("no dates or no spaces → never conflicts", () => {
  assert.equal(findConflicts({ spaces: ["Gym"], dates: [], start: "18:00", end: "20:00" }, [gymEvent]).length, 0);
  assert.equal(findConflicts({ spaces: [], dates: ["2026-08-20"], start: "18:00", end: "20:00" }, [gymEvent]).length, 0);
});

test("multiple candidates, only overlapping ones returned, earliest first", () => {
  const cands: ConflictCandidate[] = [
    { ...gymEvent, id: "late", start: "19:30", end: "21:00", title: "Late" },
    { ...gymEvent, id: "early", start: "17:00", end: "19:15", title: "Early" },
    { ...gymEvent, id: "miss", start: "08:00", end: "09:00", title: "Morning" },
  ];
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-20"], start: "19:00", end: "19:45" }, cands);
  assert.deepEqual(c.map(x => x.id), ["early", "late"]);
});

test("recurring target clashes on a non-first date and tags each by its date", () => {
  const cands: ConflictCandidate[] = [
    { ...gymEvent, id: "wk2", date: "2026-08-27", start: "18:00", end: "20:00", title: "Week 2" },
    { ...gymEvent, id: "wk4", date: "2026-09-10", start: "18:00", end: "20:00", title: "Week 4" },
  ];
  const target = { spaces: ["Gym"], dates: ["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"], start: "18:30", end: "19:30" };
  const c = findConflicts(target, cands);
  assert.deepEqual(c.map(x => `${x.id}@${x.date}`), ["wk2@2026-08-27", "wk4@2026-09-10"]);
});

test("same candidate booking on two of the target's dates reports once per date", () => {
  const cands: ConflictCandidate[] = [
    { ...gymEvent, id: "same", date: "2026-08-20" },
    { ...gymEvent, id: "same", date: "2026-08-27" },
  ];
  const c = findConflicts({ spaces: ["Gym"], dates: ["2026-08-20", "2026-08-27"], start: "19:00", end: "21:00" }, cands);
  assert.deepEqual(c.map(x => x.date), ["2026-08-20", "2026-08-27"]);
});

test("windowsOverlap edge cases", () => {
  assert.equal(windowsOverlap(540, 600, 600, 660), false); // touch
  assert.equal(windowsOverlap(540, 660, 600, 720), true); // overlap
  assert.equal(windowsOverlap(null, null, 600, 720), true); // all-day a
  assert.equal(windowsOverlap(540, 600, null, null), true); // all-day b
});

test("helpers: parse calendar timestamp + location", () => {
  assert.equal(dateFromTimestamp("2026-08-20T18:00:00+00:00"), "2026-08-20");
  assert.equal(timeFromTimestamp("2026-08-20T18:00:00+00:00"), "18:00");
  assert.deepEqual(spacesFromLocation("Gym, Kitchen"), ["Gym", "Kitchen"]);
  assert.deepEqual(spacesFromLocation(null), []);
});
