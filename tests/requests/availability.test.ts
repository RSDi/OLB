// Unit tests for the booking-calendar availability math — the slot/duration
// logic is the risky part (off-by-one at busy-window edges, capping a duration
// at the next reservation, a start that lands inside a booking).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  slotStartMinutes,
  freeStartMinutes,
  maxDurationMinutes,
  allowedDurations,
  minutesTo12h,
  minutesToHHMM,
  hhmmToMinutes,
  durationLabel,
  type BusyWindow,
} from "../../lib/requests/availability.ts";

const SIX_AM = 6 * 60;
const TEN_PM = 22 * 60;
// 6:00–8:00 PM is already booked.
const eveningBusy: BusyWindow[] = [{ start: 18 * 60, end: 20 * 60 }];

test("slotStartMinutes covers open → close minus a slot, every 30 min", () => {
  const starts = slotStartMinutes(SIX_AM, TEN_PM, 30);
  assert.equal(starts[0], SIX_AM); // 6:00 AM
  assert.equal(starts[starts.length - 1], 21 * 60 + 30); // 9:30 PM (last start that leaves a full slot)
  assert.equal(starts.length, 32);
});

test("a booked window removes exactly its overlapping starts; edges stay free", () => {
  const free = freeStartMinutes(eveningBusy, SIX_AM, TEN_PM, 30);
  assert.ok(free.includes(17 * 60 + 30)); // 5:30 PM ends at 6:00 — touches, allowed
  assert.ok(!free.includes(18 * 60)); // 6:00 PM is inside the booking
  assert.ok(!free.includes(19 * 60 + 30)); // 7:30 PM slot runs into the booking
  assert.ok(free.includes(20 * 60)); // 8:00 PM — booking just ended, free
});

test("maxDuration runs to close, capped by the next reservation", () => {
  assert.equal(maxDurationMinutes(SIX_AM, eveningBusy, TEN_PM), 18 * 60 - SIX_AM); // 6 AM → capped at 6 PM = 12h
  assert.equal(maxDurationMinutes(20 * 60, eveningBusy, TEN_PM), 2 * 60); // 8 PM → close = 2h
  assert.equal(maxDurationMinutes(18 * 60, eveningBusy, TEN_PM), 0); // start inside the booking
});

test("allowedDurations filters presets to what fits before the next booking/close", () => {
  const presets = [60, 120, 180, 240];
  assert.deepEqual(allowedDurations(20 * 60, eveningBusy, presets, TEN_PM), [60, 120]); // 8 PM, only 2h left
  assert.deepEqual(allowedDurations(SIX_AM, eveningBusy, presets, TEN_PM), [60, 120, 180, 240]); // plenty of room
});

test("no busy windows → every start free, full day bookable", () => {
  assert.equal(freeStartMinutes([], SIX_AM, TEN_PM, 30).length, 32);
  assert.equal(maxDurationMinutes(SIX_AM, [], TEN_PM), 16 * 60);
});

test("label + parse helpers", () => {
  assert.equal(minutesTo12h(18 * 60), "6:00 PM");
  assert.equal(minutesTo12h(0), "12:00 AM");
  assert.equal(minutesTo12h(12 * 60), "12:00 PM");
  assert.equal(minutesToHHMM(18 * 60), "18:00");
  assert.equal(hhmmToMinutes("18:00"), 18 * 60);
  assert.equal(hhmmToMinutes("bad"), null);
  assert.equal(durationLabel(30), "30 min");
  assert.equal(durationLabel(60), "1 hr");
  assert.equal(durationLabel(150), "2 hr 30 min");
});
