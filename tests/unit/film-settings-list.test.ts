import { test } from "node:test";
import assert from "node:assert/strict";
import { ageGroupHeading, filmTeamStatus, filterFilmTeams, groupFilmTeams } from "../../lib/film/settings-list.ts";

const teams = [
  { label: "HS Varsity", ageGroup: "HS", enabled: false, hasCode: true },
  { label: "HS JV1", ageGroup: "HS", enabled: false, hasCode: false },
  { label: "14U Gold", ageGroup: "14U", enabled: true, hasCode: true },
  { label: "Club", ageGroup: null, enabled: true, hasCode: true },
];

test("status: no code beats on/off", () => {
  assert.equal(filmTeamStatus({ enabled: true, hasCode: false }), "no-code");
  assert.equal(filmTeamStatus({ enabled: false, hasCode: true }), "off");
  assert.equal(filmTeamStatus({ enabled: true, hasCode: true }), "live");
});

test("headings", () => {
  assert.equal(ageGroupHeading("HS"), "High school");
  assert.equal(ageGroupHeading("14U"), "14U");
  assert.equal(ageGroupHeading(null), "Other teams");
});

test("filter and search", () => {
  assert.deepEqual(filterFilmTeams(teams, "live", "").map((t) => t.label), ["14U Gold", "Club"]);
  assert.deepEqual(filterFilmTeams(teams, "setup", "").map((t) => t.label), ["HS Varsity", "HS JV1"]);
  assert.deepEqual(filterFilmTeams(teams, "all", " varsity ").map((t) => t.label), ["HS Varsity"]);
});

test("groups keep list order", () => {
  assert.deepEqual(
    groupFilmTeams(teams).map((g) => [g.heading, g.teams.length]),
    [["High school", 2], ["14U", 1], ["Other teams", 1]]
  );
});
