// Notes on players (0124) and moving a player from the roster back to the
// waitlist: the attachment list a note is saved with, and the registration
// written for a player who came in from the spreadsheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAttachments, cleanNoteBody } from "../../lib/teams/player-notes.ts";
import { registrationFromPlayer, splitName, type RosterPlayerFull } from "../../lib/teams/waitlist-player.ts";

const NOTE = "0b7c2a52-3f1e-4c3b-9d7e-1a2b3c4d5e6f";
const FILE = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

test("attachments must sit in the note's own folder, with a matching kind", () => {
  const ok = cleanAttachments(NOTE, [{ path: `${NOTE}/${FILE}.png`, name: " Texts.png ", type: "image/png", size: 1200 }]);
  assert.deepEqual(ok, { value: [{ path: `${NOTE}/${FILE}.png`, name: "Texts.png", type: "image/png", size: 1200 }] });

  const other = "11111111-2222-4333-8444-555555555555";
  assert.ok("error" in cleanAttachments(NOTE, [{ path: `${other}/${FILE}.png`, name: "x", type: "image/png", size: 1 }]));
  assert.ok("error" in cleanAttachments(NOTE, [{ path: `${NOTE}/../${FILE}.png`, name: "x", type: "image/png", size: 1 }]));
  assert.ok("error" in cleanAttachments(NOTE, [{ path: `${NOTE}/${FILE}.png`, name: "x", type: "application/pdf", size: 1 }]));
  assert.ok("error" in cleanAttachments(NOTE, Array.from({ length: 11 }, () => ({ path: `${NOTE}/${FILE}.pdf`, name: "x", type: "application/pdf", size: 1 }))));
  assert.deepEqual(cleanAttachments(NOTE, undefined), { value: [] });
});

test("note bodies are trimmed and capped", () => {
  assert.equal(cleanNoteBody("  hi\r\nthere  "), "hi\nthere");
  assert.equal(cleanNoteBody(42), "");
  assert.equal(cleanNoteBody("x".repeat(20000)).length, 10000);
});

test("names split so Approve joins them back the same", () => {
  assert.deepEqual(splitName("Mary Ann Smith"), { first: "Mary", last: "Ann Smith" });
  assert.deepEqual(splitName("Cher"), { first: "Cher", last: "" });
});

const player: RosterPlayerFull = {
  id: "p1",
  board_id: "b1",
  full_name: "Sam Player",
  dob: "2017-02-28",
  age_group: "10U",
  new_to_program: true,
  address_line1: "1 Main St",
  address_line2: null,
  city: "Omaha",
  state: "NE",
  postal_code: "68106",
  phone: null,
  email: null,
  registration_fee: "8u-12u - $375.00",
  payment_method: "Venmo",
  shirt_size: "Youth M",
  waiver_signed: true,
  waiver_signed_on: "2026-09-01",
  directory_optin: true,
  jersey_number: "20",
  registered_at: "2026-09-27T00:00:00Z",
  team: { name: "Gray", age_group: "10U" },
  parents: [
    { relationship: "guardian", member: { full_name: "Pat Guardian", email: "pat@example.com", phone: "555", volunteer_interests: null } },
    { relationship: "mother", member: { full_name: "Ann Player", email: "ann@example.com", phone: "556", volunteer_interests: "Snacks" } },
  ],
};

test("a spreadsheet player becomes a waitlisted registration the form could have sent", () => {
  const reg = registrationFromPlayer(player, "No show", "u1", "2026-10-09T12:00:00Z");
  assert.equal(reg.status, "waitlisted");
  assert.equal(`${reg.first_name} ${reg.last_name}`, "Sam Player");
  assert.equal(reg.created_at, "2026-09-27T00:00:00Z");
  assert.equal(reg.notes, "No show");
  // The guardian takes the free father slot; the mother keeps hers.
  assert.equal(reg.extra.father?.first, "Pat");
  assert.equal(reg.extra.mother?.email, "ann@example.com");
  assert.equal(reg.extra.mother?.volunteer_other, "Snacks");
  assert.equal(reg.parent_email, "pat@example.com");
  assert.equal(reg.extra.fee_tier, "8u-12u - $375.00");
  assert.equal(reg.extra.first_season, true);
  assert.deepEqual(reg.extra.from_roster, {
    team: "10U Gray",
    age_group: "10U",
    jersey_number: "20",
    shirt_size: "Youth M",
    moved_at: "2026-10-09T12:00:00Z",
  });
});
