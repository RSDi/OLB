// Player requirements (Settings → Requirements, Directory chips): who a
// requirement covers, where a player stands, and how the form's input is
// cleaned up (lib/requirements/logic.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appliesTo,
  cleanRequirementInput,
  formatAmount,
  indexRows,
  parseAmount,
  requirementLabel,
  stateFor,
  type RequirementInput,
} from "../../lib/requirements/logic.ts";
import type { PlayerRequirement } from "../../lib/requirements/types.ts";

const base: RequirementInput = {
  name: "Handbook signature",
  description: "",
  kind: "task",
  amount: "",
  allowFile: true,
  dueOn: "",
  teamIds: null,
  active: true,
};

function row(playerId: string, requirementId: string, status: "done" | "waived"): PlayerRequirement {
  return {
    player_id: playerId,
    requirement_id: requirementId,
    status,
    completed_on: "2026-09-27",
    note: null,
    file_path: null,
    file_name: null,
    marked_by: null,
    updated_at: "2026-09-27T12:00:00Z",
  };
}

test("parses fee amounts into cents", () => {
  assert.equal(parseAmount("25"), 2500);
  assert.equal(parseAmount("$25.00"), 2500);
  assert.equal(parseAmount(" 25.5 "), 2550);
  assert.equal(parseAmount("1,200"), 120000);
  assert.equal(parseAmount("0"), 0);
  for (const bad of ["", "abc", "-5", "25.999", "$", "1.2.3"]) assert.equal(parseAmount(bad), null, bad);
});

test("formats cents as dollars", () => {
  assert.equal(formatAmount(2500), "$25.00");
  assert.equal(formatAmount(120050), "$1,200.50");
});

test("labels a fee with its amount", () => {
  assert.equal(requirementLabel({ name: "Tournament fee", kind: "fee", amount_cents: 2500 }), "Tournament fee $25.00");
  assert.equal(requirementLabel({ name: "Handbook signature", kind: "task", amount_cents: null }), "Handbook signature");
});

test("a requirement with no teams covers everyone", () => {
  assert.equal(appliesTo({ team_ids: null }, { team_id: "t1" }), true);
  assert.equal(appliesTo({ team_ids: [] }, { team_id: null }), true);
});

test("a team requirement covers only players on those teams", () => {
  assert.equal(appliesTo({ team_ids: ["t1", "t2"] }, { team_id: "t2" }), true);
  assert.equal(appliesTo({ team_ids: ["t1"] }, { team_id: "t3" }), false);
  assert.equal(appliesTo({ team_ids: ["t1"] }, { team_id: null }), false);
});

test("a player's state: done, waived, missing or not applicable", () => {
  const rows = indexRows([row("p1", "r1", "done"), row("p2", "r1", "waived")]);
  const req = { id: "r1", team_ids: null };
  assert.equal(stateFor({ id: "p1", team_id: null }, req, rows), "done");
  assert.equal(stateFor({ id: "p2", team_id: null }, req, rows), "waived");
  assert.equal(stateFor({ id: "p3", team_id: null }, req, rows), "missing");
  assert.equal(stateFor({ id: "p1", team_id: "t9" }, { id: "r1", team_ids: ["t1"] }, rows), "n/a");
});

test("cleans a task", () => {
  const c = cleanRequirementInput({ ...base, name: "  Handbook signature ", description: "  " });
  assert.ok(!("error" in c));
  assert.equal(c.name, "Handbook signature");
  assert.equal(c.description, null);
  assert.equal(c.amount_cents, null);
  assert.equal(c.due_on, null);
  assert.equal(c.team_ids, null);
});

test("a task never keeps an amount", () => {
  const c = cleanRequirementInput({ ...base, amount: "25" });
  assert.ok(!("error" in c));
  assert.equal(c.amount_cents, null);
});

test("a fee needs a valid amount", () => {
  const ok = cleanRequirementInput({ ...base, name: "Tournament fee", kind: "fee", amount: "$25" });
  assert.ok(!("error" in ok));
  assert.equal(ok.amount_cents, 2500);
  for (const amount of ["", "-5", "twenty"]) {
    assert.ok("error" in cleanRequirementInput({ ...base, kind: "fee", amount }), amount);
  }
});

test("rejects a blank or too-long name", () => {
  assert.ok("error" in cleanRequirementInput({ ...base, name: "   " }));
  assert.ok("error" in cleanRequirementInput({ ...base, name: "x".repeat(61) }));
});

test("team scope: none picked is an error, duplicates collapse", () => {
  assert.ok("error" in cleanRequirementInput({ ...base, teamIds: [] }));
  const c = cleanRequirementInput({ ...base, teamIds: ["t1", "t1", "t2"] });
  assert.ok(!("error" in c));
  assert.deepEqual(c.team_ids, ["t1", "t2"]);
});

test("rejects a malformed due date", () => {
  assert.ok("error" in cleanRequirementInput({ ...base, dueOn: "next week" }));
  const c = cleanRequirementInput({ ...base, dueOn: "2026-10-15" });
  assert.ok(!("error" in c));
  assert.equal(c.due_on, "2026-10-15");
});
