import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkGame,
  lineTotals,
  markTotals,
  matchPlayer,
  normalizeMarks,
  parseBookDate,
  parseFt,
  quarterChecks,
  type LineInput,
} from "../../lib/stats/marks.ts";
import { ftByHalf, seasonByPlayer, type SavedLine } from "../../lib/stats/season.ts";

function line(id: string, name: string, jersey: string, marks: Partial<Record<"q1" | "q2" | "q3" | "q4" | "ot", string>>, extra: Partial<LineInput> = {}): LineInput {
  return {
    id,
    player_id: id,
    jersey,
    book_name: name,
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    ot: "",
    rebounds: 0,
    fouls: 0,
    played: true,
    tp_written: null,
    ft_written: "",
    ...marks,
    ...extra,
  };
}

// The 2nd game on Nov 14 as the book reads, with one made free throw missing
// from Maclain's 2nd quarter.
const game2 = [
  line("x", "Xavier", "3", { q1: "2 3 1 1", q2: "0 1 2 2 2", q3: "0 0", q4: "2" }, { tp_written: 16, ft_written: "3/6" }),
  line("w", "Wes", "4", { q1: "2", q4: "2 0 1" }, { tp_written: 5, ft_written: "1/2" }),
  line("m", "Maclain", "5", { q2: "2 0 1 1", q3: "2 2", q4: "3 0 1" }, { tp_written: 13, ft_written: "4/6" }),
  line("j", "Jack", "14", { q3: "1 1" }, { tp_written: 2, ft_written: "2/2" }),
  line("g", "Grant", "15", { q2: "2 1" }, { tp_written: 3, ft_written: "1/1" }),
  line("jd", "Jared", "24", { q4: "3" }, { tp_written: 3 }),
  line("c", "Cavan", "33", { q1: "2 2", q4: "1 1" }, { tp_written: 6, ft_written: "2/2" }),
];
const book2 = { q1: 13, half: 28, q3: 34, final: 48, ft: "13/19" };

test("marks add up the way the book means them", () => {
  assert.deepEqual(markTotals("2 3 1 1"), { points: 7, fg2: 1, fg3: 1, ftm: 2, fta: 2 });
  assert.deepEqual(markTotals("0 1 2 2 2"), { points: 7, fg2: 3, fg3: 0, ftm: 1, fta: 2 });
  assert.equal(normalizeMarks("2311"), "2 3 1 1");
  assert.equal(normalizeMarks("-- 2, 0"), "2 0");
  assert.equal(lineTotals(game2[0]).points, 16);
});

test("the 2nd quarter, the final and the team free throws come up one short", () => {
  const checks = quarterChecks(game2, book2);
  assert.deepEqual(
    checks.map((c) => [c.marks, c.book]),
    [[13, 13], [14, 15], [6, 6], [14, 14]],
  );
  const flags = checkGame(game2, book2);
  const messages = flags.map((f) => f.message).join("\n");
  assert.match(messages, /2nd Q: the marks add up to 14, the book's score says 15 \(1 short\)/);
  assert.match(messages, /Final: the marks add up to 47, the book says 48/);
  assert.match(messages, /Free throws: the marks give 12\/18, the book's team total says 13\/19/);
  assert.ok(flags.some((f) => f.lineId === "m" && /total says 13/.test(f.message)));
  assert.equal(flags.filter((f) => f.lineId && f.lineId !== "m").length, 0);
});

test("with the missing free throw put back, nothing is flagged", () => {
  const fixed = game2.map((l) => (l.id === "m" ? { ...l, q2: "2 0 1 1 1" } : l));
  assert.deepEqual(checkGame(fixed, book2), []);
});

test("the overtime game checks out, overtime counted with the 4th", () => {
  const game1 = [
    line("x", "Xavier", "3", { q1: "1 0 3 2", q3: "2 2 2 2", q4: "2 0 0", ot: "1 1" }, { tp_written: 18, ft_written: "3/6" }),
    line("w", "Wes", "4", { q1: "2 2", q4: "2" }, { tp_written: 6 }),
    line("m", "Maclain", "5", { q4: "2 3" }, { tp_written: 5 }),
    line("j", "Jack", "14", { q1: "2" }, { tp_written: 2 }),
    line("g", "Grant", "15", { q2: "2 2", q3: "2", q4: "2", ot: "2" }, { tp_written: 10 }),
    line("jd", "Jared", "24", {}),
    line("c", "Cavan", "33", { q2: "2", q3: "2", q4: "0 0", ot: "2 2" }, { tp_written: 8, ft_written: "0/2" }),
  ];
  assert.deepEqual(checkGame(game1, { q1: 12, half: 18, q3: 30, final: 49, ft: "3/8" }), []);
});

test("a player nobody matched is flagged; one who didn't play isn't counted", () => {
  const lines = [line("a", "Max", "32", {}, { player_id: null, played: false }), line("b", "Sam", "23", { q1: "2" }, { player_id: null })];
  const flags = checkGame(lines, {});
  assert.equal(flags.length, 1);
  assert.equal(flags[0].lineId, "b");
});

test("free throws, dates and roster matches", () => {
  assert.deepEqual(parseFt("4/6"), { made: 4, tries: 6 });
  assert.equal(parseFt("7/6"), null);
  assert.equal(parseBookDate("14 Nov 26", 2026), "2026-11-14");
  assert.equal(parseBookDate("Nov 14", 2026), "2026-11-14");
  assert.equal(parseBookDate("11/14/26", 2026), "2026-11-14");
  assert.equal(parseBookDate("31 Feb 26", 2026), null);
  const roster = [
    { id: "p3", name: "Xavier Doe", jersey: "3" },
    { id: "p33", name: "Cavan Roe", jersey: "33" },
    { id: "p12", name: "Luke Poe", jersey: null },
  ];
  assert.equal(matchPlayer("33", "Caran", roster), "p33");
  assert.equal(matchPlayer("12", "Luke", roster), "p12");
  assert.equal(matchPlayer("99", "Nobody", roster), null);
});

test("season numbers add up per player, by quarter and by half", () => {
  const saved: SavedLine[] = [
    { game_id: "g1", player_id: "x", played: true, rebounds: 7, fouls: 3, q1: "1 0 3 2", q2: "", q3: "2 2 2 2", q4: "2 0 0", ot: "1 1", ...lineTotals({ q1: "1 0 3 2", q2: "", q3: "2 2 2 2", q4: "2 0 0", ot: "1 1" }) },
    { game_id: "g2", player_id: "x", played: true, rebounds: 3, fouls: 2, q1: "2 3 1 1", q2: "0 1 2 2 2", q3: "0 0", q4: "2", ot: "", ...lineTotals({ q1: "2 3 1 1", q2: "0 1 2 2 2", q3: "0 0", q4: "2", ot: "" }) },
    { game_id: "g2", player_id: "mx", played: false, rebounds: 0, fouls: 0, q1: "", q2: "", q3: "", q4: "", ot: "", points: 0, fg2: 0, fg3: 0, ftm: 0, fta: 0 },
  ];
  const [x, max] = seasonByPlayer(saved);
  assert.equal(x.games, 2);
  assert.equal(x.points, 34);
  assert.equal(x.rebounds, 10);
  assert.equal(x.fg, 13);
  assert.equal(x.fg3, 2);
  assert.deepEqual([x.ftm, x.fta], [6, 12]);
  assert.deepEqual(x.byPeriod, { q1: 13, q2: 7, q3: 8, q4: 4, ot: 2 });
  assert.equal(max.games, 0);
  assert.deepEqual(ftByHalf(saved), { first: { made: 4, tries: 6 }, second: { made: 2, tries: 6 } });
});
