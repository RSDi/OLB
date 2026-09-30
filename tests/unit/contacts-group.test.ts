// External Contacts grouped by company (app/portal/contacts/_shared/group.ts):
// each company with the people who work there, then the people on their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupContacts, placeLabel } from "../../app/portal/contacts/_shared/group.ts";
import type { Contact } from "../../app/portal/contacts/_shared/data.ts";

function contact(over: Partial<Contact> & { id: string; name: string }): Contact {
  return {
    kind: "person",
    parent_contact_id: null,
    category_id: null,
    nickname: null,
    email: null,
    phone: null,
    mobile_phone: null,
    website: null,
    address: null,
    account_number: null,
    customer_id: null,
    payment_terms: null,
    tax_id: null,
    notes: null,
    reorder_notes: null,
    quote_contact_notes: null,
    tags: [],
    title: null,
    city: null,
    state: null,
    alt_email: null,
    team_colors: null,
    aliases: [],
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const contacts = [
  contact({ id: "c1", kind: "company", name: "Creighton University", nickname: "Creighton" }),
  contact({ id: "c2", kind: "company", name: "Consortio Group, LLC" }),
  contact({ id: "c3", kind: "company", name: "UBT" }),
  contact({ id: "p1", name: "Kyle", parent_contact_id: "c1" }),
  contact({ id: "p2", name: "Jessi Waszak", parent_contact_id: "c2" }),
  contact({ id: "p3", name: "Ann", parent_contact_id: "c2" }),
  contact({ id: "p4", name: "Ralph", title: "Pool Coordinator" }),
  // Their company was deleted: they're on their own now.
  contact({ id: "p5", name: "Orphan", parent_contact_id: "gone" }),
];

test("each company lists its people; everyone else is on their own", () => {
  const { groups, independent } = groupContacts(contacts, () => true);
  // By the name the list shows (the nickname when there is one).
  assert.deepEqual(groups.map((g) => g.company.id), ["c2", "c1", "c3"]);
  assert.deepEqual(groups[0].people.map((p) => p.name), ["Ann", "Jessi Waszak"]);
  assert.equal(groups[2].total, 0);
  assert.deepEqual(independent.map((p) => p.id), ["p5", "p4"]);
});

test("searching a person shows them under their company", () => {
  const { groups, independent } = groupContacts(contacts, (c) => c.name.includes("Jessi"));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].company.id, "c2");
  assert.equal(groups[0].companyMatches, false);
  assert.deepEqual(groups[0].people.map((p) => p.id), ["p2"]);
  assert.equal(groups[0].total, 2);
  assert.deepEqual(independent, []);
});

test("a company that matches brings all its people", () => {
  const { groups } = groupContacts(contacts, (c) => c.id === "c2");
  assert.deepEqual(groups[0].people.map((p) => p.id), ["p3", "p2"]);
});

test("place reads City, ST", () => {
  assert.equal(placeLabel({ city: "Ames", state: "IA" }), "Ames, IA");
  assert.equal(placeLabel({ city: null, state: "IA" }), "IA");
  assert.equal(placeLabel({ city: null, state: null }), null);
});
