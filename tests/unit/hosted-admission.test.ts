import { test } from "node:test";
import assert from "node:assert/strict";
import { admissionPrices, tvSlug } from "../../lib/hosted/live-view.ts";

test("the admission text becomes prices and notes", () => {
  const r = admissionPrices("Day pass $10 · Weekend pass $15\nFamily (day or weekend) $30 · Ages 5 and under free\nPay at the gate.");
  assert.deepEqual(r.prices, [
    { label: "Day pass", price: "$10" },
    { label: "Weekend pass", price: "$15" },
    { label: "Family (day or weekend)", price: "$30" },
    { label: "Ages 5 and under", price: "Free" },
  ]);
  assert.deepEqual(r.notes, ["Pay at the gate."]);
});

test("a line that isn't all prices stays a note", () => {
  const r = admissionPrices("Adults: $8\nStudents - $5.50\nCash or card · see the table");
  assert.deepEqual(r.prices, [
    { label: "Adults", price: "$8" },
    { label: "Students", price: "$5.50" },
  ]);
  assert.deepEqual(r.notes, ["Cash or card · see the table"]);
  assert.deepEqual(admissionPrices(null), { prices: [], notes: [] });
});

test("a division's TV address", () => {
  assert.equal(tvSlug({ code: "HSA", name: "HS Boys A" }), "hsa");
  assert.equal(tvSlug({ code: null, name: "JH Boys" }), "jhboys");
});
