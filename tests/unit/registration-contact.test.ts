import { test } from "node:test";
import assert from "node:assert/strict";
import { registeringContacts } from "../../lib/teams/registration-contact.ts";

test("a player registration shows both parents when they were collected", () => {
  assert.deepEqual(
    registeringContacts({
      extra: {
        father: { first: "Chris", last: "Carter", email: "chris@example.com", phone: "402-555-0100" },
        mother: { first: "Jamie", last: "Carter", email: "jamie@example.com", phone: "402-555-0101" },
      },
    }),
    [
      { role: "Father", name: "Chris Carter", email: "chris@example.com", phone: "402-555-0100" },
      { role: "Mother", name: "Jamie Carter", email: "jamie@example.com", phone: "402-555-0101" },
    ],
  );
});

test("an assessment uses the one parent on the row", () => {
  assert.deepEqual(
    registeringContacts({
      parent_name: "Rachel Test",
      parent_email: "rachel@example.com",
      parent_phone: "402-555-0199",
      extra: {},
    }),
    [{ role: "Parent / guardian", name: "Rachel Test", email: "rachel@example.com", phone: "402-555-0199" }],
  );
});

test("N/A and blank parents are left off", () => {
  assert.deepEqual(
    registeringContacts({
      extra: {
        father: { first: "N/A", last: "N/A", email: "n/a", phone: "" },
        mother: { first: "Jamie", last: "Carter", email: "jamie@example.com" },
      },
    }),
    [{ role: "Mother", name: "Jamie Carter", email: "jamie@example.com", phone: null }],
  );
  assert.deepEqual(registeringContacts({ extra: {} }), []);
});
