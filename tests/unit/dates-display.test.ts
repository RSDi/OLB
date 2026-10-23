// Displayed dates and times use America/Chicago, not UTC. A test registered
// the evening of Oct 22 CT must not print as Oct 23 (the UTC date).
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDisplayDate, formatDisplayDateTime, formatDisplayYmd } from "../../lib/dates/display.ts";

// 8:30 PM CDT on Oct 22, 2026 is 1:30 AM UTC on Oct 23.
const EVENING_CT = "2026-10-23T01:30:00.000Z";

test("a timestamp is the Chicago calendar day, not the UTC day", () => {
  assert.equal(formatDisplayDate(EVENING_CT), "Oct 22, 2026");
  assert.equal(formatDisplayYmd(EVENING_CT), "2026-10-22");
  assert.equal(formatDisplayDateTime(EVENING_CT), "Oct 22, 2026, 8:30 PM");
});

test("a date-only value is the calendar day, with no timezone shift", () => {
  assert.equal(formatDisplayDate("2026-10-22"), "Oct 22, 2026");
  assert.equal(formatDisplayDate("2026-10-22", { year: false }), "Oct 22");
  assert.equal(formatDisplayYmd("2026-10-22"), "2026-10-22");
});

test("empty or junk input is omitted", () => {
  assert.equal(formatDisplayDate(null), null);
  assert.equal(formatDisplayDate(""), null);
  assert.equal(formatDisplayDate("not-a-date"), null);
  assert.equal(formatDisplayYmd(null), "");
});
