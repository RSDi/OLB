import { test } from "node:test";
import assert from "node:assert/strict";
import { advance, sideLabel } from "../../lib/hosted/logic.ts";
import { parseSeat, poolStandings, poolsOf, seatLabel, seatTeam } from "../../lib/hosted/standings.ts";
import type { HostedGame, HostedTeam } from "../../lib/hosted/types.ts";

function team(id: string, pool: number | null, extra: Partial<HostedTeam> = {}): HostedTeam {
  return { id, weekend_id: "w", division_id: "A", opponent_id: null, ours: false, name: id, code: id, seed: null, pool, fee_cents: null, games: null, note: null, sort_order: 0, ...extra };
}

let n = 0;
function game(home: string | null, away: string | null, hs: number | null = null, as: number | null = null, extra: Partial<HostedGame> = {}): HostedGame {
  n++;
  return {
    id: `g${n}`,
    weekend_id: "w",
    division_id: "A",
    game_no: n,
    round: 1,
    label: null,
    home_team_id: home,
    away_team_id: away,
    home_from: null,
    away_from: null,
    plays_on: null,
    starts_at: null,
    court: null,
    home_score: hs,
    away_score: as,
    ...extra,
  };
}

// HS Boys A, 2026: Pool 1 OL, BP, KCM; Pool 2 KCE, LE, WW.
const teams = [team("OL", 1), team("BP", 1), team("KCM", 1), team("KCE", 2), team("LE", 2), team("WW", 2)];

test("pools of a division, and a division with none", () => {
  assert.deepEqual(poolsOf(teams, "A"), [1, 2]);
  assert.deepEqual(poolsOf([team("x", null), team("y", null)], "A"), [null]);
});

test("standings by record, and a pool isn't done until every game has a score", () => {
  const games = [game("OL", "KCM", 54, 43), game("BP", "KCM", 61, 55), game("OL", "BP")];
  const st = poolStandings(games, teams, "A", 1);
  assert.equal(st.done, false);
  assert.equal(st.left, 1);
  // OL and BP are both 1-0 and haven't met: BP leads on points scored (61 to 54).
  assert.deepEqual(st.rows.map((r) => r.teamId), ["BP", "OL", "KCM"]);
  assert.equal(st.rows[2].teamId, "KCM");
  assert.equal(st.rows[2].l, 2);
});

test("three-way tie at 1-1: point differential among them decides", () => {
  const games = [game("LE", "KCE", 48, 51), game("LE", "WW", 44, 39), game("WW", "KCE", 50, 40)];
  // LE 1-1, KCE 1-1, WW 1-1 → three-way tie, each 1-1 among the three; point differential among them:
  // LE −3 +5 = +2; KCE +3 −10 = −7; WW −5 +10 = +5.
  const st = poolStandings(games, teams, "A", 2);
  assert.equal(st.done, true);
  assert.deepEqual(st.rows.map((r) => r.teamId), ["WW", "LE", "KCE"]);
  assert.ok(st.rows.every((r) => !r.tied));
});

test("a two-way tie on record goes to the head-to-head winner, not point differential", () => {
  const four = [team("a", null), team("b", null), team("c", null), team("d", null)];
  const g = (h: string, a: string, hs: number, as: number) => game(h, a, hs, as);
  // a and b both 2-1; b beat a by 1, but a has the far better differential.
  const games = [g("a", "b", 40, 41), g("a", "c", 80, 20), g("a", "d", 70, 30), g("b", "c", 41, 40), g("d", "b", 50, 40), g("c", "d", 45, 44)];
  const st = poolStandings(games, four, "A", null);
  assert.equal(st.rows[0].teamId, "b");
  assert.equal(st.rows[1].teamId, "a");
});

test("a dead even three-way tie is left for a coin flip", () => {
  const games = [game("OL", "BP", 50, 40), game("BP", "KCM", 50, 40), game("KCM", "OL", 50, 40)];
  const st = poolStandings(games, teams, "A", 1);
  assert.ok(st.rows.every((r) => r.tied));
  assert.equal(seatTeam(games, teams, "A", { pool: 1, place: 1 }), undefined);
});

test("seats: empty while the pool plays, the team once it's done", () => {
  const games = [game("OL", "KCM", 54, 43), game("BP", "KCM", 61, 55), game("OL", "BP")];
  assert.equal(seatTeam(games, teams, "A", { pool: 1, place: 1 }), null);
  games[2].home_score = 60;
  games[2].away_score = 50;
  assert.equal(seatTeam(games, teams, "A", { pool: 1, place: 1 }), "OL");
  assert.equal(seatTeam(games, teams, "A", { pool: 1, place: 2 }), "BP");
  assert.equal(seatTeam(games, teams, "A", { pool: 1, place: 3 }), "KCM");
});

test("advance fills Saturday's placement seats from finished pools, and a seat game doesn't count in the pool", () => {
  const pool1 = [game("OL", "KCM", 54, 43), game("BP", "KCM", 61, 55), game("OL", "BP", 60, 50)];
  const pool2 = [game("LE", "KCE", 48, 51), game("LE", "WW", 44, 39), game("WW", "KCE")];
  const final = game(null, null, null, null, { id: "final", home_from: "P:1:1", away_from: "P:2:1", label: "Championship" });
  const all = [...pool1, ...pool2, final];
  // Pool 2 still playing: only the home seat fills.
  assert.deepEqual(advance(all, teams), [{ id: "final", home_team_id: "OL", away_team_id: null }]);
  pool2[2].home_score = 30;
  pool2[2].away_score = 60;
  // KCE 2-0 tops Pool 2.
  assert.deepEqual(advance(all, teams), [{ id: "final", home_team_id: "OL", away_team_id: "KCE" }]);
  // Once filled and scored, the final itself doesn't change Pool 1.
  final.home_team_id = "OL";
  final.away_team_id = "KCE";
  final.home_score = 40;
  final.away_score = 45;
  assert.deepEqual(advance(all, teams), []);
  assert.equal(poolStandings(all, teams, "A", 1).rows[0].w, 2);
});

test("a coin-flip seat keeps the team a person put there", () => {
  const games = [game("OL", "BP", 50, 40), game("BP", "KCM", 50, 40), game("KCM", "OL", 50, 40)];
  const seatGame = game("BP", null, null, null, { id: "s", home_from: "P:1:1" });
  assert.deepEqual(advance([...games, seatGame], teams), []);
});

test("seat labels", () => {
  assert.deepEqual(parseSeat("P:2:3"), { pool: 2, place: 3 });
  assert.equal(parseSeat("W:abc"), null);
  assert.equal(seatLabel({ pool: 2, place: 3 }), "Pool 2 · 3rd");
  assert.equal(sideLabel(null, "P:1:1", new Map(), new Map()), "Pool 1 · 1st");
});
