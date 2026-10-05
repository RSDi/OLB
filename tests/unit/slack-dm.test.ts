// Slack DMs to families (lib/slack-dm/recipients.ts): one DM per person, not
// per family, and {name} / {player} filled in for each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { playerTarget, type PlayerWithParents } from "../../lib/teams/family-mail.ts";
import { dmPeople, fillDm, greetingName, roleWords, safeReturnPath, slackText } from "../../lib/slack-dm/recipients.ts";

type Parent = PlayerWithParents["parents"][number];
const dad: Parent = { relationship: "father", member: { full_name: "Chris Carter", email: "chris@example.com" } };
const mom: Parent = { relationship: "mother", member: { full_name: "Jamie Carter", email: "jamie@example.com" } };
const player = (id: string, full_name: string, parents: Parent[], email: string | null = null): PlayerWithParents => ({ id, full_name, email, parents });

test("each parent gets their own DM, not one per family", () => {
  const { people, noContact } = dmPeople([playerTarget(player("a", "Sam Carter", [dad, mom]))]);
  assert.deepEqual(
    people.map((p) => [p.email, p.roles]),
    [
      ["chris@example.com", ["father"]],
      ["jamie@example.com", ["mother"]],
    ]
  );
  assert.deepEqual(noContact, []);
});

test("a parent of brothers and sisters gets one DM naming all of them", () => {
  const { people } = dmPeople([playerTarget(player("a", "Sam Carter", [dad, mom])), playerTarget(player("b", "Evan Carter", [dad]))]);
  const chris = people.find((p) => p.email === "chris@example.com")!;
  assert.deepEqual(chris.players.map((t) => t.first_name), ["Sam", "Evan"]);
  assert.equal(fillDm("Hi {name}, {player}'s handbook?", chris), "Hi Chris, Sam and Evan's handbook?");
  assert.equal(people.length, 2);
});

test("only the people picked, and players with nobody to message listed apart", () => {
  const sam = playerTarget(player("a", "Sam Carter", [dad, mom], "sam@example.com"));
  const leo = playerTarget(player("c", "Leo Park", [{ relationship: "mother", member: { full_name: "Ana Park", email: null } }]));
  const { people, noContact } = dmPeople([sam, leo], ["mother", "player"]);
  assert.deepEqual(people.map((p) => p.email), ["jamie@example.com", "sam@example.com"]);
  assert.deepEqual(noContact.map((t) => t.name), ["Leo Park"]);
});

test("a player with a parent's email is reached once, through the parent", () => {
  const { people } = dmPeople([playerTarget(player("a", "Sam Carter", [dad, mom], "jamie@example.com"))]);
  assert.deepEqual(people.map((p) => p.email), ["jamie@example.com", "chris@example.com"]);
});

test("{name} greets by first name, or 'there' when the roster only says Mom", () => {
  assert.equal(greetingName({ name: "Jamie Carter" }), "Jamie");
  assert.equal(greetingName({ name: "Mom" }), "");
  assert.equal(fillDm("Hi {NAME},", { name: "Mom", players: [{ first_name: "Sam" }] }), "Hi there,");
});

test("Slack markup characters arrive as typed", () => {
  assert.equal(slackText("  Fees < $50 & <@U123> > 0 \n"), "Fees &lt; $50 &amp; &lt;@U123&gt; &gt; 0");
});

test("roles read as Dad, Mom, Guardian, Player in that order", () => {
  assert.equal(roleWords(["player", "mother"]), "Mom & Player");
});

test("after connecting Slack, only a portal page is a place to come back to", () => {
  assert.equal(safeReturnPath("/portal/directory/players/abc"), "/portal/directory/players/abc");
  assert.equal(safeReturnPath("/portal"), "/portal");
  for (const bad of ["https://evil.example", "//evil.example/portal", "/portalx", "/login", "/portal\\..\\x", null, ""]) {
    assert.equal(safeReturnPath(bad), "/portal/directory", String(bad));
  }
});
