// Tournaments we host (lib/hosted/logic.ts): the brackets and pools, filling
// the courts, moving winners on, the money and the program email.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STEPS,
  advance,
  cleanDays,
  daysForWeekend,
  fillCourts,
  formatTime,
  initials,
  lineCount,
  moneySummary,
  placementBracket,
  placesLabel,
  programMessage,
  roundRobin,
  seedOrder,
  slotsFor,
  teamFee,
} from "../../lib/hosted/logic.ts";
import type { HostedGame, HostedMoney, HostedPlan, HostedTeam } from "../../lib/hosted/types.ts";

const plan: HostedPlan = {
  weekend_id: "w",
  hosted: true,
  short_name: "MRS",
  finance_event_id: null,
  game_minutes: 75,
  courts: 4,
  days: [],
  team_fee_cents: 24000,
  facility: "5 Arena Way, Council Bluffs, IA 51501",
  concessions: "Fieldhouse Cafe. No outside food or drink.",
  rules: null,
  admission: null,
};

function team(id: string, extra: Partial<HostedTeam> = {}): HostedTeam {
  return { id, weekend_id: "w", division_id: "d", opponent_id: null, ours: false, name: id, code: null, seed: null, fee_cents: null, note: null, sort_order: 0, ...extra };
}

function game(id: string, extra: Partial<HostedGame> = {}): HostedGame {
  return {
    id,
    weekend_id: "w",
    division_id: "d",
    game_no: 0,
    round: 1,
    label: null,
    home_team_id: null,
    away_team_id: null,
    home_from: null,
    away_from: null,
    plays_on: null,
    starts_at: null,
    court: null,
    home_score: null,
    away_score: null,
    ...extra,
  };
}

test("the hosted checklist bills programs and auto-checks collection by step_key", () => {
  const keys = DEFAULT_STEPS.map((s) => s.key).filter(Boolean);
  assert.deepEqual(keys, ["bill_programs", "invoices_sent", "team_fees_collected"]);
  const teams = DEFAULT_STEPS.filter((s) => s.section === "teams").map((s) => s.label);
  assert.ok(teams.includes("Set team fees and bill each program"));
  assert.ok(teams.includes("Invoices sent"));
  assert.ok(teams.includes("Team fees collected"));
  const collected = DEFAULT_STEPS.find((s) => s.key === "team_fees_collected");
  const sent = DEFAULT_STEPS.find((s) => s.key === "invoices_sent");
  const bill = DEFAULT_STEPS.find((s) => s.key === "bill_programs");
  assert.ok(bill && sent && collected);
  assert.ok(DEFAULT_STEPS.indexOf(bill) < DEFAULT_STEPS.indexOf(sent));
  assert.ok(DEFAULT_STEPS.indexOf(sent) < DEFAULT_STEPS.indexOf(collected));
});

test("seed order keeps the top seeds apart", () => {
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test("an eight-team placement bracket is the JV bracket sheet: 12 games, Game 9 for first", () => {
  const g = placementBracket(8);
  assert.equal(g.length, 12);
  assert.deepEqual(g.map((x) => x.round), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  // Game 5: winners of games 1 and 2; Game 7: their losers.
  assert.deepEqual([g[4].home, g[4].away], [{ from: "W", game: 0 }, { from: "W", game: 1 }]);
  assert.deepEqual([g[6].home, g[6].away], [{ from: "L", game: 0 }, { from: "L", game: 1 }]);
  assert.deepEqual(g.slice(8).map((x) => x.places), [[1, 2], [3, 4], [5, 6], [7, 8]]);
  assert.equal(placesLabel([1, 2]), "First, Second");
  assert.deepEqual([g[0].home, g[0].away], [{ seed: 0 }, { seed: 7 }]);
});

test("a short bracket gives the top seeds byes and skips games nobody plays", () => {
  const g = placementBracket(6);
  assert.equal(g.length, 7);
  assert.ok(g.every((x) => !("bye" in x.home) && !("bye" in x.away)));
  assert.equal(placementBracket(4).length, 4);
  assert.equal(placementBracket(1).length, 0);
  // Every team plays at least twice.
  for (let s = 0; s < 6; s++) {
    const firstRound = g.filter((x) => x.round === 1 && ((("seed" in x.home) && x.home.seed === s) || (("seed" in x.away) && x.away.seed === s)));
    assert.ok(firstRound.length <= 1);
  }
});

test("a round robin plays everyone once, nobody twice in a round", () => {
  for (const n of [3, 4, 5, 6]) {
    const g = roundRobin(n);
    assert.equal(g.length, (n * (n - 1)) / 2);
    const pairs = new Set(g.map((x) => [("seed" in x.home && x.home.seed), ("seed" in x.away && x.away.seed)].sort().join("-")));
    assert.equal(pairs.size, g.length);
    for (const r of new Set(g.map((x) => x.round))) {
      const seen = g.filter((x) => x.round === r).flatMap((x) => [("seed" in x.home && x.home.seed), ("seed" in x.away && x.away.seed)]);
      assert.equal(new Set(seen).size, seen.length);
    }
  }
});

test("the days follow the weekend and keep the times set", () => {
  const d = daysForWeekend("2026-11-13", "2026-11-14", [{ date: "2026-11-14", start: "08:00", end: "12:00" }]);
  assert.deepEqual(d, [
    { date: "2026-11-13", start: "17:00", end: "21:30" },
    { date: "2026-11-14", start: "08:00", end: "12:00" },
  ]);
  assert.deepEqual(cleanDays([{ date: "2026-11-13", start: "9:00", end: "8:00" }]), { error: "Friday, Nov 13 closes before it opens." });
  assert.equal(formatTime("14:00"), "2:00 PM");
  assert.equal(formatTime("00:30"), "12:30 AM");
});

test("slots run a game length apart while a game still ends by closing", () => {
  const s = slotsFor([{ date: "2026-11-13", start: "14:00", end: "17:45" }], 75, 2);
  assert.deepEqual(s.map((x) => `${x.start}/${x.court}`), ["840/1", "840/2", "915/1", "915/2", "990/1", "990/2"]);
});

test("filling the courts: no team twice at once, bracket games after their feeders", () => {
  const slots = slotsFor([{ date: "2026-11-13", start: "14:00", end: "22:00" }], 60, 2);
  const games = [
    game("a", { game_no: 1, home_team_id: "t1", away_team_id: "t2" }),
    game("b", { game_no: 2, home_team_id: "t1", away_team_id: "t3" }),
    game("c", { game_no: 3, home_team_id: "t4", away_team_id: "t5" }),
    game("d", { game_no: 4, round: 2, home_from: "W:a" }),
  ];
  const { placed, unplaced } = fillCourts(games, slots, 60);
  const at = new Map(placed.map((p) => [p.id, p]));
  assert.deepEqual(unplaced, []);
  assert.equal(at.get("a")!.starts_at, "14:00");
  assert.equal(at.get("b")!.starts_at, "16:00"); // t1 plays at 2, and gets a rest
  assert.equal(at.get("c")!.starts_at, "14:00");
  assert.ok(at.get("d")!.starts_at >= "15:00");
});

test("back to back only when there's no room for a rest", () => {
  const slots = slotsFor([{ date: "2026-11-13", start: "14:00", end: "16:00" }], 60, 1);
  const { placed } = fillCourts([game("a", { game_no: 1, home_team_id: "t1", away_team_id: "t2" }), game("b", { game_no: 2, home_team_id: "t1", away_team_id: "t3" })], slots, 60);
  assert.deepEqual(placed.map((p) => p.starts_at), ["14:00", "15:00"]);
});

test("a game already placed keeps its slot", () => {
  const slots = slotsFor([{ date: "2026-11-13", start: "14:00", end: "16:00" }], 60, 1);
  const { placed, unplaced } = fillCourts(
    [game("a", { plays_on: "2026-11-13", starts_at: "14:00:00", court: 1 }), game("b", { game_no: 2 }), game("c", { game_no: 3 })],
    slots,
    60
  );
  assert.deepEqual(placed, [{ id: "b", plays_on: "2026-11-13", starts_at: "15:00", court: 1 }]);
  assert.deepEqual(unplaced, ["c"]);
});

test("a score moves the winner and loser on", () => {
  const g = [
    game("a", { home_team_id: "t1", away_team_id: "t2", home_score: 40, away_score: 52 }),
    game("b", { home_from: "W:a", away_from: "L:a" }),
  ];
  assert.deepEqual(advance(g), [{ id: "b", home_team_id: "t2", away_team_id: "t1" }]);
  // Taking the score off clears them again.
  const undone = [{ ...g[0], home_score: null, away_score: null }, { ...g[1], home_team_id: "t2", away_team_id: "t1" }];
  assert.deepEqual(advance(undone), [{ id: "b", home_team_id: null, away_team_id: null }]);
});

test("the money: team fees, counts times amounts, referees by games", () => {
  const teams = [team("ol", { ours: true }), team("kcm"), team("le", { fee_cents: 0 }), team("ww", { fee_cents: 16000 })];
  assert.equal(teamFee(teams[0], 24000), 0);
  const line = (extra: Partial<HostedMoney>): HostedMoney => ({ id: "m", weekend_id: "w", kind: "expense", category: "other", label: "x", qty: null, unit_cents: 0, division_id: null, note: null, sort_order: 0, ...extra });
  const games = [game("a"), game("b"), game("c", { division_id: "other" })];
  const money = [
    line({ kind: "revenue", category: "admission", qty: 50, unit_cents: 3000 }),
    line({ category: "court", qty: 45, unit_cents: 5000 }),
    line({ category: "referee", unit_cents: 12000, division_id: "d" }),
  ];
  assert.equal(lineCount(money[2], games), 2);
  const s = moneySummary(plan, teams, money, games);
  assert.equal(s.teamFees, 40000);
  assert.equal(s.teamsPaying, 2);
  assert.equal(s.revenue, 40000 + 150000);
  assert.equal(s.expense, 225000 + 24000);
  assert.equal(s.net, s.revenue - s.expense);
});

test("the program email has who's coming, the facility and the court schedule", () => {
  const teams = [team("t1", { name: "Omaha Lightning 1", code: "OL 1" }), team("t2", { name: "KC Metro 1", code: "KCM 1" })];
  const { subject, body } = programMessage({
    title: "Missouri River Shootout",
    dates: "Nov 13–14",
    facilityName: "Iowa West Fieldhouse",
    plan,
    divisions: [{ id: "d", weekend_id: "w", name: "HS Boys A", code: "HSA", format: "pool", sort_order: 0 }],
    teams,
    games: [game("a", { game_no: 1, home_team_id: "t1", away_team_id: "t2", plays_on: "2026-11-13", starts_at: "14:00", court: 1 })],
    programs: [{ name: "KC Metro", status: "confirmed" }, { name: "Maybe Club", status: "tentative" }],
  });
  assert.equal(subject, "Missouri River Shootout: Nov 13–14");
  assert.match(body, /ATTENDING PROGRAMS\nKC Metro\n\nDIVISIONS/);
  assert.doesNotMatch(body, /Maybe Club/);
  assert.match(body, /Iowa West Fieldhouse\n5 Arena Way/);
  assert.match(body, /2:00 PM {2}Court 1 {2}Game 1: HSA \(OL 1 vs KCM 1\)/);
  assert.match(body, /\$240 per team/);
  assert.equal(initials("Missouri River Shootout"), "MRS");
});
