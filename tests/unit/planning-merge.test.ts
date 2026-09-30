// Two people editing one board meeting (lib/planning/merge.ts): changes to
// different parts combine, the same part changed two ways is a conflict, and
// nobody's edit is dropped without them choosing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFields, mergeSnapshots, type MeetingSnapshot } from "../../lib/planning/merge.ts";

const base: MeetingSnapshot = {
  meetsOn: "2026-10-13",
  status: "planned",
  agendaMd: "- Budget",
  minutesMd: "",
  notes: { a: "Handbook approved" },
};
const edit = (over: Partial<MeetingSnapshot>): MeetingSnapshot => ({ ...base, ...over, notes: { ...base.notes, ...(over.notes ?? {}) } });

test("changes to different parts combine", () => {
  const mine = edit({ minutesMd: "Present: Jeff, Sam", notes: { b: "Order jerseys" } });
  const theirs = edit({ status: "held", notes: { a: "Handbook approved; send Friday" } });
  const { merged, conflicts } = mergeSnapshots(base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.minutesMd, "Present: Jeff, Sam");
  assert.equal(merged.status, "held");
  assert.deepEqual(merged.notes, { a: "Handbook approved; send Friday", b: "Order jerseys" });
});

test("a part both changed differently is a conflict, and theirs stays until someone chooses", () => {
  const mine = edit({ minutesMd: "Mine" });
  const theirs = edit({ minutesMd: "Theirs" });
  const { merged, conflicts } = mergeSnapshots(base, mine, theirs);
  assert.deepEqual(conflicts, ["minutesMd"]);
  assert.equal(merged.minutesMd, "Theirs");
});

test("the same change made twice isn't a conflict", () => {
  const same = edit({ status: "held", notes: { a: "Done" } });
  assert.deepEqual(mergeSnapshots(base, same, same).conflicts, []);
});

test("parts I didn't touch never overwrite what someone else saved", () => {
  const mine = cloneOf(base);
  const theirs = edit({ agendaMd: "- Budget\n- Fundamentals", meetsOn: "2026-10-20" });
  const { merged, conflicts } = mergeSnapshots(base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.equal(merged.agendaMd, "- Budget\n- Fundamentals");
  assert.equal(merged.meetsOn, "2026-10-20");
});

test("removing a note someone else just edited is a conflict; removing an untouched one isn't", () => {
  const mineRemoves: MeetingSnapshot = { ...base, notes: {} };
  assert.deepEqual(mergeSnapshots(base, mineRemoves, edit({ notes: { a: "Edited" } })).conflicts, ["note:a"]);
  const { merged, conflicts } = mergeSnapshots(base, mineRemoves, cloneOf(base));
  assert.deepEqual(conflicts, []);
  assert.deepEqual(merged.notes, {});
});

test("trailing spaces and blank notes don't count as changes", () => {
  const mine = edit({ minutesMd: "  ", notes: { a: "Handbook approved  \n", c: "" } });
  assert.deepEqual(changedFields(base, mine), []);
});

function cloneOf(s: MeetingSnapshot): MeetingSnapshot {
  return { ...s, notes: { ...s.notes } };
}

test("the History page's diff shows added and removed lines, with a little context", async () => {
  const { lineDiff, diffContext } = await import("../../lib/planning/diff.ts");
  const d = lineDiff("Present: Jeff\nBudget OK\nNext: Oct 20", "Present: Jeff, Sam\nBudget OK\nNext: Oct 20");
  assert.deepEqual(d, [
    { kind: "removed", text: "Present: Jeff" },
    { kind: "added", text: "Present: Jeff, Sam" },
    { kind: "same", text: "Budget OK" },
    { kind: "same", text: "Next: Oct 20" },
  ]);
  assert.deepEqual(lineDiff("", "One"), [{ kind: "added", text: "One" }]);
  const long = Array.from({ length: 10 }, (_, i) => `line ${i}`);
  const changed = [...long];
  changed[5] = "line five";
  const ctx = diffContext(lineDiff(long.join("\n"), changed.join("\n")));
  assert.deepEqual(ctx.map((l) => (l ? `${l.kind}:${l.text}` : "…")), [
    "same:line 4",
    "removed:line 5",
    "added:line five",
    "same:line 6",
  ]);
});
