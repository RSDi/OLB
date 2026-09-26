// Unit tests for the team manager's roster-spreadsheet parser
// (lib/teams/parse-roster.ts). The rows mimic the real "Teams" sheet: two
// side-by-side column blocks (cols 0-3 and 5-8), team headers as dividers,
// and an unlabeled team at the top of the right block.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoster } from "../../lib/teams/parse-roster.ts";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

// [name, dob, age, practice, (gap), name, dob, age, practice]
const ROWS: unknown[][] = [
  ["2026/2027", null, null, "Practice Times", null, null, null, null, null],
  ["12U RED 6th Mid Bronze (Smith / Jones)", null, null, "Mon 6-8pm", null, "Carl Right", d("2009-03-01"), 17, "Tue 7-9pm"],
  ["Alex Able", d("2014-05-02"), 12, null, null, "Dan Right (Sr.)", d("2008-01-15"), 18, null],
  ["Ben Baker", d("2024-01-01"), 12, "Thu 6-8pm", null, null, null, null, null],
  ["Total Players", null, null, null, null, null, null, null, null],
  ["2", null, null, null, null, null, null, null, null],
  ["14U GOLD 8th Lower Silver (Lee", null, null, null, null, null, null, null, null],
  ["Cy Cole", 41426, 13, null, null, null, null, null, null],
];

test("reads both column blocks into teams, left block first", () => {
  const res = parseRoster(ROWS, { referenceYear: 2026 });
  assert.deepEqual(res.teams.map((t) => t.name), ["12U RED", "14U GOLD", "(unnamed team)"]);
  assert.equal(res.totalPlayers, 5);
});

test("parses color, grade, division and coaches from a team header", () => {
  const [red] = parseRoster(ROWS, { referenceYear: 2026 }).teams;
  assert.equal(red.age_group, "12U");
  assert.equal(red.color, "RED");
  assert.equal(red.grade_label, "6th");
  assert.equal(red.division, "Mid Bronze");
  assert.deepEqual(red.coaches, ["Smith", "Jones"]);
  assert.deepEqual(red.practice_times, ["Mon 6-8pm", "Thu 6-8pm"]);
});

test("a GOLD team's division isn't misread from its color", () => {
  const gold = parseRoster(ROWS, { referenceYear: 2026 }).teams[1];
  assert.equal(gold.color, "GOLD");
  assert.equal(gold.division, "Lower Silver");
  assert.deepEqual(gold.coaches, ["Lee"]); // missing ")" tolerated
});

test("skips legend/total rows and bare numbers", () => {
  const [red] = parseRoster(ROWS, { referenceYear: 2026 }).teams;
  assert.deepEqual(red.players.map((p) => p.full_name), ["Alex Able", "Ben Baker"]);
});

test("flags an implausible DOB, leaves a plausible one clean", () => {
  const res = parseRoster(ROWS, { referenceYear: 2026 });
  const [alex, ben] = res.teams[0].players;
  assert.equal(alex.dob, "2014-05-02");
  assert.equal(alex.flag, null);
  assert.equal(ben.flag, "dob_check");
  assert.ok(res.flags.some((f) => f.includes("1 player(s) have a questionable date of birth")));
});

test("Excel serial dates convert to ISO", () => {
  const cy = parseRoster(ROWS, { referenceYear: 2026 }).teams[1].players[0];
  assert.equal(cy.dob, "2013-06-01");
  assert.equal(cy.flag, null);
});

test("the unlabeled right-block team needs a name; (Sr.) becomes the grade", () => {
  const res = parseRoster(ROWS, { referenceYear: 2026 });
  const unnamed = res.teams[2];
  assert.equal(unnamed.needs_name, true);
  assert.deepEqual(unnamed.players.map((p) => [p.full_name, p.grade]), [
    ["Carl Right", null],
    ["Dan Right", "Sr."],
  ]);
  assert.ok(res.flags.some((f) => f.includes("1 team(s) have no name")));
});
