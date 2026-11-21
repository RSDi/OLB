import { test } from "node:test";
import assert from "node:assert/strict";
import { matchTournament, tournamentChoices, tournamentForDate } from "../../lib/film/tournaments.ts";

const schedule = [
  { name: "Heartland Hoops Classic", startsOn: "2026-11-20", endsOn: "2026-11-22" },
  { name: "Turkey Shootout", startsOn: "2026-11-27", endsOn: "2026-11-28" },
];

test("the scheduled tournament on the game date is suggested", () => {
  assert.equal(tournamentForDate(schedule, "2026-11-21")?.name, "Heartland Hoops Classic");
  assert.equal(tournamentForDate(schedule, "2026-11-22")?.name, "Heartland Hoops Classic");
  assert.equal(tournamentForDate(schedule, "2026-11-28")?.name, "Turkey Shootout");
  assert.equal(tournamentForDate(schedule, "2026-11-24"), null);
  assert.equal(tournamentForDate(schedule, ""), null);
});

test("the dropdown lists the schedule newest first, then names used on Film", () => {
  const choices = tournamentChoices(schedule, ["heartland hoops  classic", "Fall League", ""]);
  assert.deepEqual(choices, [
    { name: "Turkey Shootout", dates: "Nov 27–28" },
    { name: "Heartland Hoops Classic", dates: "Nov 20–22" },
    { name: "Fall League", dates: null },
  ]);
  assert.equal(matchTournament(choices, "fall league")?.name, "Fall League");
  assert.equal(matchTournament(choices, "Spring League"), null);
  assert.equal(matchTournament(choices, ""), null);
});

test("0180 backfills only games with no tournament, by the same schedule rule", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const sql = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0180_film_event_backfill.sql"), "utf8");
  assert.match(sql, /where u\.event_name is null/);
  assert.match(sql, /u\.game_date between w\.starts_on and w\.ends_on/);
  assert.match(sql, /w\.status not in \('canceled', 'off'\)/);
  assert.match(sql, /left\(regexp_replace\(btrim\(w\.event\), '\\s\+', ' ', 'g'\), 80\)/);
  assert.doesNotMatch(sql, /create (table|function|sequence)/i);
});
