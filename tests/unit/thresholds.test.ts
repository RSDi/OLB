// Unit tests for the two pure threshold rules: low-stock crossing (A3) and
// the board voting majority (A1 — keep in sync with cast_request_vote in
// migration 0050).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crossedThreshold } from "../../lib/supplies/threshold.ts";
import { majorityThreshold } from "../../lib/votes/threshold.ts";

test("dropping through the threshold fires", () => {
  assert.equal(crossedThreshold(5, 1, 2), true);
});

test("landing exactly on the threshold fires", () => {
  assert.equal(crossedThreshold(3, 2, 2), true);
});

test("already at/below the threshold does NOT re-fire", () => {
  assert.equal(crossedThreshold(1, 0, 2), false); // below → lower
  assert.equal(crossedThreshold(2, 1, 2), false); // at → below
});

test("staying above the threshold does not fire", () => {
  assert.equal(crossedThreshold(5, 3, 2), false);
});

test("restocking never fires", () => {
  assert.equal(crossedThreshold(1, 10, 2), false);
});

test("majority of the full 7-member board is 4", () => {
  assert.equal(majorityThreshold(7), 4);
});

test("majority math across board sizes", () => {
  assert.equal(majorityThreshold(1), 1);
  assert.equal(majorityThreshold(2), 2);
  assert.equal(majorityThreshold(3), 2);
  assert.equal(majorityThreshold(4), 3);
  assert.equal(majorityThreshold(6), 4);
});

test("an empty board can't deadlock at zero", () => {
  assert.equal(majorityThreshold(0), 1);
});
