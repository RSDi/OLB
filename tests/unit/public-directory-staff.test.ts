import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPEN_SPOT_LABEL,
  assignedCount,
  directorySearch,
  isDirectoryCoach,
  spotMatches,
  spotsForTeam,
  staffCountLabel,
  volunteerSummary,
  type PublicAssignment,
  type PublicRole,
  type PublicSpot,
} from "../../lib/teams/public-directory-staff.ts";

const roles: PublicRole[] = [
  { id: "hc", name: "Head coach", spots: 1, coach: true },
  { id: "ac", name: "Assistant coach", spots: 2, coach: true },
  { id: "mom", name: "Team mom", spots: 1, coach: false },
  { id: "sk", name: "Scorekeeper", spots: 1, coach: false },
  { id: "ck", name: "Clock", spots: 1, coach: false },
  { id: "ph", name: "Photographer", spots: 1, coach: false },
];

function person(id: string, roleId: string, name: string, teamId = "gold"): PublicAssignment {
  return { id, team_id: teamId, role_id: roleId, name, phone: "402-555-0100", email: `${id}@example.com` };
}

test("coaches are leadership roles and any role whose name says coach", () => {
  assert.equal(isDirectoryCoach({ name: "Head coach", is_leadership: true }), true);
  assert.equal(isDirectoryCoach({ name: "Bench coach", is_leadership: false }), true);
  assert.equal(isDirectoryCoach({ name: "Scorekeeper", is_leadership: false }), false);
  assert.equal(isDirectoryCoach({ name: "Clock" }), false);
  assert.equal(isDirectoryCoach({ name: "Photographer" }), false);
  // A future leadership role stays with the coaches, open by default.
  assert.equal(isDirectoryCoach({ name: "Team manager", is_leadership: true }), true);
});

test("volunteer seats include Open Spot, coaches list only people", () => {
  const assignments = [
    person("a", "hc", "Ada Coach"),
    person("b", "sk", "Bea Book"),
    person("c", "ac", "Cy Bench"),
    person("d", "ac", "Ann Bench"),
  ];
  const coaches = spotsForTeam(roles, assignments, "gold", "coach");
  assert.deepEqual(
    coaches.map((s) => s.name),
    ["Ada Coach", "Ann Bench", "Cy Bench"]
  );
  assert.equal(coaches.some((s) => s.name === null), false);

  const volunteers = spotsForTeam(roles, assignments, "gold", "volunteer");
  assert.deepEqual(
    volunteers.map((s) => [s.role, s.name ?? OPEN_SPOT_LABEL]),
    [
      ["Team mom", OPEN_SPOT_LABEL],
      ["Scorekeeper", "Bea Book"],
      ["Clock", OPEN_SPOT_LABEL],
      ["Photographer", OPEN_SPOT_LABEL],
    ]
  );
  assert.equal(assignedCount(volunteers), 1);
  assert.equal(volunteerSummary(volunteers), "Bea Book · 3 open");
});

test("a role added later shows up without a special case", () => {
  const withFilm: PublicRole[] = [...roles, { id: "film", name: "Film", spots: 2, coach: false }];
  const seats = spotsForTeam(withFilm, [], "gold", "volunteer");
  assert.deepEqual(
    seats.map((s) => s.role),
    ["Team mom", "Scorekeeper", "Clock", "Photographer", "Film", "Film"]
  );
  assert.equal(seats.every((s) => s.name === null), true);
  assert.equal(volunteerSummary(seats), "6 open spots");
});

test("seats from another team stay on that team", () => {
  const assignments = [person("a", "sk", "Bea Book", "black")];
  const gold = spotsForTeam(roles, assignments, "gold", "volunteer");
  const black = spotsForTeam(roles, assignments, "black", "volunteer");
  assert.equal(gold.find((s) => s.role === "Scorekeeper")?.name, null);
  assert.equal(black.find((s) => s.role === "Scorekeeper")?.name, "Bea Book");
});

test("more people than seats still show, and do not add an open seat", () => {
  const assignments = [person("a", "ck", "Ann"), person("b", "ck", "Bea")];
  const seats = spotsForTeam(roles, assignments, "gold", "volunteer").filter((s) => s.role === "Clock");
  assert.deepEqual(
    seats.map((s) => s.name),
    ["Ann", "Bea"]
  );
});

test("volunteer summary and staff count wording", () => {
  const open = (n: number): PublicSpot[] =>
    Array.from({ length: n }, (_, i) => ({ key: String(i), roleId: "ck", role: "Clock", name: null, phone: null, email: null }));
  assert.equal(volunteerSummary(open(1)), "1 open spot");
  assert.equal(volunteerSummary([]), "");
  const filled: PublicSpot[] = [
    { key: "1", roleId: "sk", role: "Scorekeeper", name: "Bea", phone: null, email: null },
    { key: "2", roleId: "ph", role: "Photographer", name: "Cam", phone: null, email: null },
  ];
  assert.equal(volunteerSummary(filled), "Bea, Cam");
  const many: PublicSpot[] = [
    ...filled,
    { key: "3", roleId: "ck", role: "Clock", name: "Dee", phone: null, email: null },
  ];
  assert.equal(volunteerSummary(many), "Bea, Cam +1");
  assert.equal(staffCountLabel(1, 1), "1 coach · 1 volunteer");
  assert.equal(staffCountLabel(2, 0), "2 coaches · 0 volunteers");
});

test("search matches a name, a role, or three phone digits", () => {
  const spot: PublicSpot = {
    key: "1",
    roleId: "sk",
    role: "Scorekeeper",
    name: "Bea Book",
    phone: "(402) 555-0142",
    email: "bea@example.com",
  };
  assert.equal(spotMatches("bea", spot), true);
  assert.equal(spotMatches("score", spot), true);
  assert.equal(spotMatches("5550142", spot), true);
  assert.equal(spotMatches("clock", spot), false);
  assert.equal(directorySearch("", ["anything"], []), true);
  const open: PublicSpot = { ...spot, name: null, phone: null, email: null };
  assert.equal(spotMatches("scorekeeper", open), true);
  assert.equal(spotMatches("bea", open), false);
});
