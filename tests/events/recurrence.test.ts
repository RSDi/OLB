// Unit tests for the event recurrence engine — shared by the calendar expansion
// and the shutdown-task generator, so its weekly/monthly expansion + skip dates
// must be exact. (June 2026: the 7th is a Sunday; last Sunday is the 28th.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyOccurrence, eventOccurrenceDates } from "../../lib/events/recurrence.ts";

test("monthlyOccurrence: last Sunday of June 2026 = the 28th", () => {
  assert.equal(monthlyOccurrence(2026, 5, -1, 0), "2026-06-28");
});

test("monthlyOccurrence: first Tuesday of June 2026 = the 2nd", () => {
  assert.equal(monthlyOccurrence(2026, 5, 1, 2), "2026-06-02");
});

test("monthlyOccurrence: second Sunday of June 2026 = the 14th", () => {
  assert.equal(monthlyOccurrence(2026, 5, 2, 0), "2026-06-14");
});

test("monthlyOccurrence: 5th Friday that doesn't exist → null", () => {
  // June 2026 Fridays: 5,12,19,26 — no 5th Friday.
  assert.equal(monthlyOccurrence(2026, 5, 5 as number, 5), null);
});

test("non-recurring event → no occurrences", () => {
  assert.deepEqual(
    eventOccurrenceDates({ start_at: "2026-06-01T10:00:00Z", recurring: false }, "2026-06-01", "2026-12-31"),
    []
  );
});

test("weekly: Sundays in a window", () => {
  const dates = eventOccurrenceDates(
    { start_at: "2026-06-01T10:00:00", recurring: true, recur_freq: "weekly", recur_weekdays: [0] },
    "2026-06-01",
    "2026-06-30"
  );
  assert.deepEqual(dates, ["2026-06-07", "2026-06-14", "2026-06-21", "2026-06-28"]);
});

test("monthly: last Sunday across several months", () => {
  const dates = eventOccurrenceDates(
    { start_at: "2026-06-01T10:00:00", recurring: true, recur_freq: "monthly", recur_monthly_week: -1, recur_monthly_weekday: 0 },
    "2026-06-01",
    "2026-08-31"
  );
  // Last Sundays: Jun 28, Jul 26, Aug 30.
  assert.deepEqual(dates, ["2026-06-28", "2026-07-26", "2026-08-30"]);
});

test("recur_except drops skipped occurrences", () => {
  const dates = eventOccurrenceDates(
    {
      start_at: "2026-06-01T10:00:00",
      recurring: true,
      recur_freq: "weekly",
      recur_weekdays: [0],
      recur_except: ["2026-06-14"],
    },
    "2026-06-01",
    "2026-06-30"
  );
  assert.deepEqual(dates, ["2026-06-07", "2026-06-21", "2026-06-28"]);
});

test("recur_until caps the series", () => {
  const dates = eventOccurrenceDates(
    { start_at: "2026-06-01T10:00:00", recurring: true, recur_freq: "weekly", recur_weekdays: [0], recur_until: "2026-06-15" },
    "2026-06-01",
    "2026-12-31"
  );
  assert.deepEqual(dates, ["2026-06-07", "2026-06-14"]);
});
