import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchAgentContacts, parseContactsQuery, type AgentContactRow } from "../../lib/agent/contacts.ts";
import { agentPayloadLeaks } from "../../lib/agent/film.ts";
import { agentKeyAccess, generateAgentKey, hashAgentKey } from "../../lib/agent/keys.ts";

const PROGRAMS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KC_EAST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VISION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const categories = new Map([[PROGRAMS, "Programs"]]);

function row(partial: Partial<AgentContactRow> & Pick<AgentContactRow, "id" | "name">): AgentContactRow {
  return {
    kind: "person",
    nickname: null,
    title: null,
    email: null,
    alt_email: null,
    parent_contact_id: null,
    category_id: null,
    city: null,
    state: null,
    aliases: [],
    deleted_at: null,
    ...partial,
  };
}

const ROWS: AgentContactRow[] = [
  row({ id: KC_EAST, kind: "company", name: "KC East Basketball", category_id: PROGRAMS, aliases: ["KC East"], city: "Lee's Summit", state: "MO" }),
  row({ id: "11111111-1111-4111-8111-111111111111", name: "Garrett Frecks", email: " GFrecks@BurnsMcD.com ", parent_contact_id: KC_EAST, category_id: PROGRAMS }),
  row({ id: VISION, kind: "company", name: "Vision Basketball", email: "info@vision.example", alt_email: "amesvisionbb@gmail.com", category_id: PROGRAMS, city: "Ames", state: "IA" }),
  row({ id: "22222222-2222-4222-8222-222222222222", name: "Old Coach", email: "gone@example.com", deleted_at: "2026-10-01T00:00:00Z" }),
];

function q(qs: string) {
  const parsed = parseContactsQuery(new URLSearchParams(qs));
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

test("a key without contacts:read is forbidden; an unknown key is unauthorized", () => {
  const filmKey = generateAgentKey();
  const contactsKey = generateAgentKey();
  const keys = [
    { hash: hashAgentKey(filmKey), scopes: ["read"] },
    { hash: hashAgentKey(contactsKey), scopes: ["contacts:read"] },
  ];
  assert.equal(agentKeyAccess(`Bearer ${contactsKey}`, keys, "contacts:read"), "ok");
  assert.equal(agentKeyAccess(`Bearer ${filmKey}`, keys, "contacts:read"), "forbidden");
  assert.equal(agentKeyAccess(`Bearer ${contactsKey}`, keys, "read"), "forbidden");
  assert.equal(agentKeyAccess(`Bearer ${generateAgentKey()}`, keys, "contacts:read"), "unauthorized");
  assert.equal(agentKeyAccess(null, keys, "contacts:read"), "unauthorized");
  assert.equal(agentKeyAccess(`Bearer ${contactsKey}`, [], "contacts:read"), "unauthorized");
});

test("query: repeatable or comma emails, normalized; email or q required", () => {
  assert.deepEqual(q("email=GFrecks@burnsmcd.com&email=a@b.com,%20A@B.com").emails, ["gfrecks@burnsmcd.com", "a@b.com"]);
  assert.ok("error" in parseContactsQuery(new URLSearchParams("")));
  assert.ok("error" in parseContactsQuery(new URLSearchParams("q=a")));
  assert.ok("error" in parseContactsQuery(new URLSearchParams("email=notanemail")));
  assert.ok("error" in parseContactsQuery(new URLSearchParams("q=kc&kind=team")));
  assert.ok("error" in parseContactsQuery(new URLSearchParams("q=kc&parent_id=nope")));
  assert.equal(q("q=kc&limit=500").limit, 100);
});

test("matches on email (case-insensitive) with parent and category", () => {
  const res = matchAgentContacts(ROWS, categories, q("email=gfrecks@burnsmcd.com"));
  assert.deepEqual(res.missing, []);
  assert.equal(res.contacts.length, 1);
  assert.deepEqual(res.contacts[0], {
    id: "11111111-1111-4111-8111-111111111111",
    kind: "person",
    name: "Garrett Frecks",
    nickname: null,
    title: null,
    email: "GFrecks@BurnsMcD.com",
    altEmail: null,
    matchedOn: "email",
    parent: { id: KC_EAST, name: "KC East Basketball" },
    category: { id: PROGRAMS, name: "Programs" },
    city: null,
    state: null,
    aliases: [],
  });
});

test("matches on alt_email and lists emails with no hit as missing", () => {
  const res = matchAgentContacts(
    ROWS,
    categories,
    q("email=amesvisionbb@gmail.com,Adam.Lenzen@pinnbank.com&email=gfrecks@burnsmcd.com"),
  );
  assert.deepEqual(res.missing, ["adam.lenzen@pinnbank.com"]);
  const vision = res.contacts.find((c) => c.id === VISION);
  assert.equal(vision?.matchedOn, "alt_email");
  assert.equal(vision?.parent, null);
  assert.equal(vision?.kind, "company");
  assert.equal(res.contacts.length, 2);
});

test("deleted contacts never match", () => {
  const res = matchAgentContacts(ROWS, categories, q("email=gone@example.com&q=old"));
  assert.deepEqual(res.contacts, []);
  assert.deepEqual(res.missing, ["gone@example.com"]);
});

test("q searches names and aliases; kind and parent_id narrow", () => {
  assert.deepEqual(matchAgentContacts(ROWS, categories, q("q=kc east")).contacts.map((c) => c.matchedOn), ["q"]);
  assert.deepEqual(matchAgentContacts(ROWS, categories, q("q=basketball&kind=company")).contacts.map((c) => c.name), [
    "KC East Basketball",
    "Vision Basketball",
  ]);
  assert.deepEqual(
    matchAgentContacts(ROWS, categories, q(`q=frecks&parent_id=${KC_EAST}`)).contacts.map((c) => c.name),
    ["Garrett Frecks"],
  );
  assert.deepEqual(matchAgentContacts(ROWS, categories, q(`q=frecks&parent_id=${VISION}`)).contacts, []);
});

test("responses carry no phones, addresses, tax ids, notes, or secrets", () => {
  const res = matchAgentContacts(ROWS, categories, q("q=ba&email=gfrecks@burnsmcd.com"));
  assert.deepEqual(agentPayloadLeaks(res), []);
  const json = JSON.stringify(res);
  for (const field of ["phone", "address", "tax", "account", "notes", "customer"]) {
    assert.doesNotMatch(json, new RegExp(field, "i"));
  }
  const load = readFileSync(join(import.meta.dirname, "../../lib/agent/contacts-load.ts"), "utf8");
  const columns = /const COLUMNS =\s*"([^"]+)"/.exec(load)?.[1] ?? "";
  assert.ok(columns.includes("alt_email"));
  for (const col of ["phone", "address", "tax_id", "account_number", "notes", "customer_id", "*"]) {
    assert.ok(!columns.includes(col), `loader must not select ${col}`);
  }
  assert.doesNotMatch(load, /select\("\*"\)/);
});

test("before: no contacts route; after: GET only, gated on contacts:read", () => {
  const route = readFileSync(join(import.meta.dirname, "../../app/api/agent/contacts/route.ts"), "utf8");
  assert.match(route, /agentDeny\(request, \{ scope: "contacts:read" \}\)/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  const migration = readFileSync(join(import.meta.dirname, "../../supabase/migrations/0163_agent_contacts_read.sql"), "utf8");
  assert.match(migration, /'contacts:read'/);
});
