import { test } from "node:test";
import assert from "node:assert/strict";
import { coryCountFromInput, parseCoryCount } from "../../lib/fun/cory.ts";

test("parseCoryCount reads a saved whole number and falls back to 0", () => {
  assert.equal(parseCoryCount("42"), 42);
  assert.equal(parseCoryCount(" 7 "), 7);
  assert.equal(parseCoryCount(null), 0);
  assert.equal(parseCoryCount("-3"), 0);
  assert.equal(parseCoryCount("2.5"), 0);
  assert.equal(parseCoryCount("lots"), 0);
});

test("coryCountFromInput takes whole numbers, commas allowed", () => {
  assert.equal(coryCountFromInput("1,234"), 1234);
  assert.equal(coryCountFromInput("0"), 0);
  assert.equal(coryCountFromInput("-1"), null);
  assert.equal(coryCountFromInput("3.5"), null);
  assert.equal(coryCountFromInput(""), null);
  assert.equal(coryCountFromInput("99999999"), null);
});
