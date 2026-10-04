// Emailing families from the Directory (lib/teams/family-mail.ts): who a
// player's emails go to, and one email per family.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contactEmails,
  fillMessage,
  groupByFamily,
  playerTarget,
  rolesPresent,
  type MailTarget,
  type PlayerWithParents,
} from "../../lib/teams/family-mail.ts";

type Parent = PlayerWithParents["parents"][number];
const dad: Parent = { relationship: "father", member: { full_name: "Chris Carter", email: "Chris@Example.com " } };
const mom: Parent = { relationship: "mother", member: { full_name: "Jamie Carter", email: "jamie@example.com" } };
const player = (id: string, full_name: string, parents: Parent[], email: string | null = null): PlayerWithParents => ({ id, full_name, email, parents });
const contactsOf = (t: MailTarget) => t.contacts;

test("a Directory player's people are their parents on the roster, then the player", () => {
  const sam = playerTarget(player("a", " Sam  Carter ", [dad, mom], "sam@example.com"));
  assert.equal(sam.first_name, "Sam");
  assert.equal(sam.name, "Sam  Carter");
  assert.deepEqual(sam.contacts, [
    { role: "father", name: "Chris Carter", email: "chris@example.com" },
    { role: "mother", name: "Jamie Carter", email: "jamie@example.com" },
    { role: "player", name: "Sam  Carter", email: "sam@example.com" },
  ]);
  assert.deepEqual(contactEmails(sam.contacts, ["mother", "player"]), ["jamie@example.com", "sam@example.com"]);

  // A guardian counts as a parent; no name falls back to the role; a parent
  // without a usable email, or a removed one, is skipped.
  const leo = playerTarget(
    player("b", "Leo Park", [
      { relationship: "guardian", member: { full_name: null, email: "gran@example.com" } },
      { relationship: "father", member: { full_name: "Dan Park", email: "n/a" } },
      { relationship: "mother", member: null },
    ])
  );
  assert.deepEqual(leo.contacts, [{ role: "guardian", name: "Guardian", email: "gran@example.com" }]);
  assert.deepEqual(rolesPresent([...leo.contacts, ...playerTarget(player("c", "Max", [mom])).contacts]), ["mother", "guardian"]);
});

test("brothers and sisters with the same parents get one email between them", () => {
  const targets = [
    player("a", "Sam Carter", [dad, mom], "sam@example.com"),
    player("b", "Evan Carter", [mom, dad]),
    // Same mom, a different dad: their own email, so nobody reads about a
    // child who isn't theirs.
    player("c", "Ava Lane", [mom, { relationship: "father", member: { full_name: "Tom Lane", email: "tom@example.com" } }]),
    player("d", "Max Ford", []),
  ].map(playerTarget);

  const all = groupByFamily(targets, contactsOf);
  assert.deepEqual(all.groups.map((g) => [g.players.map((t) => t.first_name), g.emails]), [
    [["Sam", "Evan"], ["chris@example.com", "jamie@example.com", "sam@example.com"]],
    [["Ava"], ["jamie@example.com", "tom@example.com"]],
  ]);
  assert.deepEqual(all.noEmail.map((t) => t.name), ["Max Ford"]);
  assert.equal(fillMessage("Hi, {player}'s family", all.groups[0].players), "Hi, Sam and Evan's family");

  // Dads only.
  const dads = groupByFamily(targets, contactsOf, ["father"]);
  assert.deepEqual(dads.groups.map((g) => g.emails), [["chris@example.com"], ["tom@example.com"]]);
  assert.deepEqual(dads.noEmail.map((t) => t.first_name), ["Max"]);
});
