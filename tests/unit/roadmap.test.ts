// The roadmap's rules (lib/roadmap/model.ts): what the form may save, and the
// order each column shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRoadmapItem, columnItems, formatDay, type RoadmapItem } from "../../lib/roadmap/model.ts";

const form = { title: "  Push notifications ", description: " On your phone. ", area: "Portal", status: "planned", releasedOn: "" };

test("a planned item saves trimmed, with no date", () => {
  assert.deepEqual(cleanRoadmapItem(form), {
    title: "Push notifications",
    description: "On your phone.",
    area: "Portal",
    status: "planned",
    released_on: null,
  });
});

test("a date typed before moving out of Released is dropped", () => {
  const row = cleanRoadmapItem({ ...form, status: "progress", releasedOn: "2026-10-09" });
  assert.ok(!("error" in row) && row.released_on === null);
});

test("a released item needs a real day", () => {
  assert.deepEqual(cleanRoadmapItem({ ...form, status: "released", releasedOn: "" }), { error: "Enter the day it went live." });
  assert.deepEqual(cleanRoadmapItem({ ...form, status: "released", releasedOn: "2026-02-30" }), { error: "Enter the day it went live." });
  const row = cleanRoadmapItem({ ...form, status: "released", releasedOn: "2026-10-09" });
  assert.ok(!("error" in row) && row.released_on === "2026-10-09");
});

test("title, area and column are checked", () => {
  assert.ok("error" in cleanRoadmapItem({ ...form, title: "   " }));
  assert.ok("error" in cleanRoadmapItem({ ...form, title: "x".repeat(121) }));
  assert.ok("error" in cleanRoadmapItem({ ...form, area: "Somewhere" }));
  assert.ok("error" in cleanRoadmapItem({ ...form, status: "done" }));
});

test("Released shows newest first; other columns oldest first", () => {
  const it = (id: string, status: RoadmapItem["status"], created_at: string, released_on: string | null = null): RoadmapItem =>
    ({ id, title: id, description: "", area: "Portal", status, released_on, created_at });
  const items = [
    it("a", "released", "2026-01-01", "2026-09-01"),
    it("b", "released", "2026-01-02", "2026-10-01"),
    it("c", "planned", "2026-03-01"),
    it("d", "planned", "2026-02-01"),
  ];
  assert.deepEqual(columnItems(items, "released").map((i) => i.id), ["b", "a"]);
  assert.deepEqual(columnItems(items, "planned").map((i) => i.id), ["d", "c"]);
  assert.deepEqual(columnItems(items, "proposed"), []);
});

test("dates leave off the year only for this year", () => {
  const now = new Date(2026, 9, 9);
  assert.equal(formatDay("2026-10-09", now), "Oct 9");
  assert.equal(formatDay("2025-12-31", now), "Dec 31, 2025");
});
