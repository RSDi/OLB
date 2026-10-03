// The registration waitlist (lib/teams/waitlist.ts): who a family's emails go
// to, one email per family, the message text and the spreadsheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allEmails,
  familyContacts,
  familyEmails,
  fillMessage,
  firstNames,
  groupFamilies,
  mailtoHref,
  messageHtml,
  waitlistCsv,
  type WaitlistRow,
} from "../../lib/teams/waitlist.ts";

const reg = (id: string, first: string, extra: WaitlistRow["extra"], more: Partial<WaitlistRow> = {}): WaitlistRow => ({
  id,
  first_name: first,
  last_name: "Carter",
  dob: "2016-04-19",
  created_at: "2026-09-28T15:00:00Z",
  parent_email: null,
  extra,
  notes: null,
  reviewed_at: null,
  reviewed_by_name: null,
  contacted_at: null,
  contacted_by_name: null,
  ...more,
});

const parents = { father: { first: "Chris", last: "Carter", email: "Chris@Example.com" }, mother: { first: "Jamie", last: "Carter", email: "jamie@example.com " } };

test("a family's contacts are Dad, Mom and the player, each with their own email", () => {
  const r = reg("a", "Sam", { ...parents, athlete_email: "sam@example.com" });
  assert.deepEqual(familyContacts(r), [
    { role: "father", name: "Chris Carter", email: "chris@example.com" },
    { role: "mother", name: "Jamie Carter", email: "jamie@example.com" },
    { role: "player", name: "Sam Carter", email: "sam@example.com" },
  ]);
  assert.deepEqual(familyEmails(r), ["chris@example.com", "jamie@example.com", "sam@example.com"]);
  assert.deepEqual(familyEmails(r, ["mother"]), ["jamie@example.com"]);
  assert.deepEqual(familyEmails(r, ["player"]), ["sam@example.com"]);
  // No parent email on the form: the row's parent email stands in for them.
  assert.deepEqual(familyEmails(reg("c", "Sam", {}, { parent_email: "p@example.com" }), ["father", "mother"]), ["p@example.com"]);
  // The same address for everyone goes out once.
  assert.deepEqual(familyEmails(reg("d", "Sam", { mother: { email: "same@example.com" }, father: { email: "SAME@example.com" }, athlete_email: "same@example.com" })), ["same@example.com"]);
  assert.deepEqual(familyEmails(reg("e", "Sam", { father: { email: "N/A" } })), []);
});

test("brothers and sisters get one email between them, to the people picked", () => {
  const regs = [
    reg("a", "Sam", { ...parents, athlete_email: "sam@example.com" }),
    reg("b", "Evan", { mother: parents.mother, father: parents.father }),
    reg("c", "Leo", { mother: { email: "robin@example.com" } }),
    reg("d", "Max", {}),
  ];
  const all = groupFamilies(regs);
  assert.deepEqual(all.groups.map((g) => [g.registrations.map((r) => r.first_name), g.emails]), [
    [["Sam", "Evan"], ["chris@example.com", "jamie@example.com", "sam@example.com"]],
    [["Leo"], ["robin@example.com"]],
  ]);
  assert.deepEqual(all.noEmail.map((r) => r.first_name), ["Max"]);
  // Players only: Sam's own email; Evan and Leo have none, so the Carters
  // still get one email (Sam's) and Leo's family is left out.
  const players = groupFamilies(regs, ["player"]);
  assert.deepEqual(players.groups.map((g) => g.emails), [["sam@example.com"]]);
  assert.deepEqual(players.noEmail.map((r) => r.first_name), ["Leo", "Max"]);
  assert.deepEqual(allEmails([reg("a", "Sam", parents), reg("b", "Evan", parents)]), ["chris@example.com", "jamie@example.com"]);
});

test("{player} becomes the family's players' names", () => {
  assert.equal(firstNames([{ first_name: "Sam" }, { first_name: "Evan" }, { first_name: "Leo" }]), "Sam, Evan and Leo");
  assert.equal(fillMessage("Thanks for registering {player}. {PLAYER} is on the list.", [{ first_name: "Sam" }, { first_name: "Evan" }]), "Thanks for registering Sam and Evan. Sam and Evan is on the list.");
  assert.equal(fillMessage("Hi {player}", []), "Hi your player");
});

test("a message becomes safe email HTML", () => {
  assert.equal(messageHtml("Hi,\n\nLine one\nline <two> & three\n"), "<p>Hi,</p>\n<p>Line one<br>line &lt;two&gt; &amp; three</p>");
  assert.equal(mailtoHref(["a@example.com", "b+x@example.com"], "Registration for Sam & Evan"), "mailto:a%40example.com,b%2Bx%40example.com?subject=Registration%20for%20Sam%20%26%20Evan");
});

test("the spreadsheet has a row per registration, quoted where needed", () => {
  const csv = waitlistCsv([
    reg("a", "Sam", { ...parents, fee_tier: "8u-12u - $375.00", address: { line1: "100 Maple St", city: "Omaha", state: "NE", zip: "68104" } }, {
      notes: 'Full, "first in line"\nif a spot opens',
      reviewed_at: "2026-10-01T12:00:00Z",
      reviewed_by_name: "Rachel",
    }),
  ]);
  const [head, row] = csv.trim().split("\r\n");
  assert.ok(head.startsWith("Player,Birthday,Fee,Registered,Waitlisted"));
  assert.ok(row.startsWith("Sam Carter,2016-04-19,8u-12u - $375.00,2026-09-28,2026-10-01,Rachel,\"Full, \"\"first in line\"\" if a spot opens\""));
  assert.ok(row.endsWith('"100 Maple St, Omaha, NE 68104"'));
});
