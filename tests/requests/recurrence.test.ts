// Unit tests for the recurrence resolver — this is the single source of truth
// for which concrete dates a request covers (wizard preview, stored details,
// conflict checker, and calendar-booker all call it), so its weekly expansion,
// extras, and exclusions must be exact. (2026-08-20 is a Thursday → weekday 4.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRequestDates,
  resolveOccurrences,
  generateWeeklyDates,
  summarizeDates,
  formatDateLabel,
} from "../../lib/requests/recurrence.ts";

test("non-recurring → just the anchor date", () => {
  assert.deepEqual(resolveRequestDates({ date: "2026-08-20" }), ["2026-08-20"]);
  assert.deepEqual(resolveRequestDates({ date: "2026-08-20", recurring: false }), ["2026-08-20"]);
});

test("no valid anchor and not recurring → empty", () => {
  assert.deepEqual(resolveRequestDates({}), []);
  assert.deepEqual(resolveRequestDates({ date: "not-a-date" }), []);
  assert.deepEqual(resolveRequestDates(null), []);
});

test("weekly recurrence expands to every matching weekday through the end date", () => {
  const dates = resolveRequestDates({
    date: "2026-08-20",
    recurring: true,
    recurWeekdays: [4], // Thursdays
    recurUntil: "2026-09-10",
  });
  assert.deepEqual(dates, ["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"]);
});

test("anchor is always included even if it doesn't match a chosen weekday", () => {
  const dates = resolveRequestDates({
    date: "2026-08-18", // a Tuesday
    recurring: true,
    recurWeekdays: [4], // Thursdays
    recurUntil: "2026-09-10",
  });
  assert.deepEqual(dates, ["2026-08-18", "2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"]);
});

test("exclusions drop dates; extras add one-offs; result is sorted + unique", () => {
  const dates = resolveRequestDates({
    date: "2026-08-20",
    recurring: true,
    recurWeekdays: [4],
    recurUntil: "2026-09-10",
    recurExcludes: ["2026-08-27"],
    recurExtras: ["2026-12-25", "2026-08-20"], // duplicate anchor is deduped
  });
  assert.deepEqual(dates, ["2026-08-20", "2026-09-03", "2026-09-10", "2026-12-25"]);
});

test("recurring with no weekdays/until falls back to the anchor (+ any extras)", () => {
  assert.deepEqual(resolveRequestDates({ date: "2026-08-20", recurring: true }), ["2026-08-20"]);
  assert.deepEqual(
    resolveRequestDates({ date: "2026-08-20", recurring: true, recurExtras: ["2026-08-25"] }),
    ["2026-08-20", "2026-08-25"],
  );
});

test("generateWeeklyDates: empty when inputs are incomplete", () => {
  assert.deepEqual(generateWeeklyDates({ start: "2026-08-20", weekdays: [], until: "2026-09-10" }), []);
  assert.deepEqual(generateWeeklyDates({ start: "2026-08-20", weekdays: [4], until: null }), []);
});

test("a long weekly series is NOT silently truncated at the old ~400-day bound", () => {
  // 2026-01-01 is a Thursday; ~74 Thursdays through mid-2027 (~517 days).
  const dates = generateWeeklyDates({ start: "2026-01-01", weekdays: [4], until: "2027-06-01" });
  assert.ok(dates.length > 57, `expected the full run, got ${dates.length}`); // old 400/7 ≈ 57 cap
  assert.ok(dates[dates.length - 1] > "2027-02-05", "series must reach past the old 400-day cutoff");
});

test("summarizeDates + formatDateLabel render human labels", () => {
  assert.equal(formatDateLabel("2026-08-20"), "Aug 20");
  assert.equal(formatDateLabel("garbage"), "garbage");
  assert.equal(summarizeDates([]), "");
  assert.equal(summarizeDates(["2026-08-20"]), "Aug 20");
  assert.equal(
    summarizeDates(["2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10"]),
    "Aug 20 – Sep 10 · 4 dates",
  );
});

test("resolveOccurrences: single date carries its window", () => {
  assert.deepEqual(resolveOccurrences({ date: "2026-08-20", startTime: "18:00", endTime: "20:00" }), [
    { date: "2026-08-20", start: "18:00", end: "20:00" },
  ]);
});

test("resolveOccurrences: recurring same-hours applies one window to every date", () => {
  const occ = resolveOccurrences({
    date: "2026-08-20",
    startTime: "18:00",
    endTime: "20:00",
    recurring: true,
    recurWeekdays: [4],
    recurUntil: "2026-09-03",
  });
  assert.deepEqual(occ, [
    { date: "2026-08-20", start: "18:00", end: "20:00" },
    { date: "2026-08-27", start: "18:00", end: "20:00" },
    { date: "2026-09-03", start: "18:00", end: "20:00" },
  ]);
});

test("resolveOccurrences: per-day hours override per date; unlisted days fall back to default", () => {
  const occ = resolveOccurrences({
    date: "2026-08-20",
    startTime: "18:00",
    endTime: "20:00",
    recurring: true,
    recurWeekdays: [4],
    recurUntil: "2026-09-03",
    sameHours: false,
    dayHours: {
      "2026-08-27": { start: "09:00", end: "11:00" }, // this Thursday is a morning slot
    },
  });
  assert.deepEqual(occ, [
    { date: "2026-08-20", start: "18:00", end: "20:00" }, // default
    { date: "2026-08-27", start: "09:00", end: "11:00" }, // overridden
    { date: "2026-09-03", start: "18:00", end: "20:00" }, // default
  ]);
});
