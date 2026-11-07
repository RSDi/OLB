// The roster rules (lib/teams/roster-logic.ts): which player on the roster a
// registration is, so the New registrations page says what Approve will do,
// and what Edit player may save.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPlayerEdit, formatHeight, matchRoster, pickExistingPlayer, playerProfileFacts } from "../../lib/teams/roster-logic.ts";

const roster = [
  { id: "a", full_name: "Sam Carter", dob: "2016-04-19" },
  { id: "b", full_name: "Evan Brooks", dob: null },
  { id: "c", full_name: "Owen Miller", dob: "2015-06-12" },
];

test("a registration with the same name and birthday is that player", () => {
  const m = matchRoster({ first_name: " sam ", last_name: "CARTER", dob: "2016-04-19" }, roster);
  assert.equal(m?.kind, "same");
  assert.equal(m?.player.id, "a");
});

test("a missing birthday on either side still matches by name", () => {
  assert.equal(matchRoster({ first_name: "Evan", last_name: "Brooks", dob: "2012-04-18" }, roster)?.kind, "same");
  assert.equal(matchRoster({ first_name: "Owen", last_name: "Miller", dob: null }, roster)?.kind, "same");
});

test("the same name with a different birthday is a new player", () => {
  const m = matchRoster({ first_name: "Owen", last_name: "Miller", dob: "2010-11-15" }, roster);
  assert.equal(m?.kind, "other");
  assert.equal(m?.player.id, "c");
});

test("a new name matches nobody", () => {
  assert.equal(matchRoster({ first_name: "Leo", last_name: "Bennett", dob: "2015-11-08" }, roster), null);
});

test("the birthday match wins over a namesake without one", () => {
  const twins = [
    { id: "x", dob: null },
    { id: "y", dob: "2014-01-01" },
  ];
  assert.equal(pickExistingPlayer(twins, "2014-01-01")?.id, "y");
  assert.equal(pickExistingPlayer(twins, "2013-01-01")?.id, "x");
  assert.equal(pickExistingPlayer([], "2013-01-01"), null);
});

test("Edit player tidies what it saves", () => {
  const r = cleanPlayerEdit({
    full_name: "  Ben   Foster ",
    dob: "2017-02-28",
    jersey_number: " 00 ",
    age_group: "10u",
    email: " ben@example.com ",
    phone: " (555)  123-4567 ",
    grade: " 8th ",
    position: "Point guard",
    height_inches: 70,
  });
  assert.deepEqual(r, {
    value: { full_name: "Ben Foster", dob: "2017-02-28", jersey_number: "00", age_group: "10U", email: "ben@example.com", phone: "(555) 123-4567", grade: "8th", position: "Point guard", height_inches: 70 },
  });
  const blank = cleanPlayerEdit({ full_name: "Ben Foster", dob: "", jersey_number: "", age_group: "", email: "", phone: " ", grade: "", position: "", height_inches: null });
  assert.deepEqual(blank, { value: { full_name: "Ben Foster", dob: null, jersey_number: null, age_group: null, email: null, phone: null, grade: null, position: null, height_inches: null } });
  assert.ok("value" in cleanPlayerEdit({ full_name: "Ben", dob: null, jersey_number: null, age_group: "8U", email: null, phone: "+1 555.123.4567", grade: "HS", position: null, height_inches: null }));
});

test("Edit player turns away what doesn't fit", () => {
  const bad = (input: Parameters<typeof cleanPlayerEdit>[0]) => "error" in cleanPlayerEdit(input);
  const ok = { full_name: "Ben Foster", dob: null, jersey_number: null, age_group: null, email: null, phone: null, grade: null, position: null, height_inches: null };
  assert.ok(bad({ ...ok, full_name: "   " }));
  assert.ok(bad({ ...ok, dob: "2017-02-30" }));
  assert.ok(bad({ ...ok, dob: "Feb 28" }));
  assert.ok(bad({ ...ok, jersey_number: "1234" }));
  assert.ok(bad({ ...ok, jersey_number: "#5" }));
  assert.ok(bad({ ...ok, age_group: "Varsity" }));
  assert.ok(bad({ ...ok, email: "ben@" }));
  assert.ok(bad({ ...ok, email: "ben foster@example.com" }));
  assert.ok(bad({ ...ok, phone: "555-1234 ext" }));
  assert.ok(bad({ ...ok, phone: "12345" }));
  assert.ok(bad({ ...ok, position: "Goalie" }));
  assert.ok(bad({ ...ok, height_inches: 20 }));
  assert.ok(bad({ ...ok, height_inches: 100 }));
  assert.ok(bad({ ...ok, height_inches: 65.5 }));
});

test("grade, position and height read as one line", () => {
  assert.equal(formatHeight(70), "5′10″");
  assert.equal(formatHeight(60), "5′0″");
  assert.equal(formatHeight(null), null);
  assert.deepEqual(playerProfileFacts({ grade: "8th", position: "Center", height_inches: 74 }), ["8th grade", "Center", "6′2″"]);
  assert.deepEqual(playerProfileFacts({ grade: "HS", position: null, height_inches: null }), ["Grade HS"]);
  assert.deepEqual(playerProfileFacts({}), []);
});
