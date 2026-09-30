// A contact's history in words (lib/contacts/history.ts): what each change
// did, field by field, and what "Restore this version" puts back.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTACT_FIELDS,
  differsFrom,
  formatFieldValue,
  referencedIds,
  restorePatch,
  versionFieldChanges,
  versionSummary,
  type ContactVersion,
} from "../../lib/contacts/history.ts";

const SNAPSHOT = {
  id: "c1",
  kind: "company",
  name: "Des Moines Warriors",
  nickname: null,
  category_id: "t-programs",
  parent_contact_id: null,
  email: "office@example.org",
  phone: "515-555-0100",
  city: "Des Moines",
  state: "IA",
  aliases: ["DMW"],
  tags: ["nchc"],
  notes: null,
  created_at: "2026-09-01T12:00:00+00:00",
  updated_at: "2026-09-02T12:00:00+00:00",
  created_by: "u1",
  deleted_at: null,
};

function version(over: Partial<ContactVersion>): ContactVersion {
  return {
    id: "v1",
    contact_id: "c1",
    action: "edited",
    changes: {},
    snapshot: SNAPSHOT,
    source: "app",
    changed_by: "u1",
    impersonator_user_id: null,
    changed_at: "2026-09-30T15:00:00+00:00",
    ...over,
  };
}

test("an edit lists the fields it changed, in the form's order", () => {
  const v = version({
    changes: {
      tags: [["nchc"], ["nchc", "host"]],
      phone: ["515-555-0100", "515-555-0199"],
      // Not a field the form edits: left out.
      deleted_at: [null, null],
    },
  });
  const changes = versionFieldChanges(v);
  assert.deepEqual(
    changes.map((c) => [c.field.label, c.before, c.after]),
    [
      ["Phone", "515-555-0100", "515-555-0199"],
      ["Tags", ["nchc"], ["nchc", "host"]],
    ]
  );
  assert.equal(versionSummary(v), "changed the phone and tags");
});

test("summaries say who did what", () => {
  assert.equal(versionSummary(version({ action: "created", changes: {} })), "added it");
  assert.equal(versionSummary(version({ action: "created", source: "import" })), "added it from the spreadsheet");
  assert.equal(
    versionSummary(version({ source: "import", changes: { email: [null, "a@b.org"], city: [null, "Ames"] } })),
    "filled in the city and email from the spreadsheet"
  );
  assert.equal(versionSummary(version({ source: "restore", changes: { email: ["x", "y"] } })), "put back an earlier version");
  assert.equal(versionSummary(version({ action: "deleted" })), "moved it to the deleted bin");
  assert.equal(versionSummary(version({ action: "undeleted" })), "brought it back from the deleted bin");
  assert.equal(versionSummary(version({ action: "start" })), "History starts here");
  const many = Object.fromEntries(["name", "email", "phone", "city", "state"].map((k) => [k, ["a", "b"] as [unknown, unknown]]));
  assert.equal(versionSummary(version({ changes: many })), "changed 5 fields");
});

test("an added contact shows what it was saved with", () => {
  const v = version({ action: "created" });
  const labels = versionFieldChanges(v).map((c) => c.field.label);
  assert.deepEqual(labels, ["Name", "Type", "City", "State", "Email", "Phone", "Also known as", "Tags"]);
});

test("values read as the page shows them", () => {
  const lookups = { types: new Map([["t-programs", "Programs"]]), companies: new Map([["co1", "UBT"]]) };
  assert.equal(formatFieldValue("email", null, lookups), "—");
  assert.equal(formatFieldValue("tags", [], lookups), "—");
  assert.equal(formatFieldValue("aliases", ["DMW", "DM Warriors"], lookups), "DMW, DM Warriors");
  assert.equal(formatFieldValue("category_id", "t-programs", lookups), "Programs");
  assert.equal(formatFieldValue("category_id", "gone", lookups), "A type that's since been deleted");
  assert.equal(formatFieldValue("parent_contact_id", "co1", lookups), "UBT");
});

test("the type and company ids a history mentions are looked up", () => {
  const ids = referencedIds([
    version({ snapshot: { ...SNAPSHOT, parent_contact_id: "co1" }, changes: { category_id: ["t-old", "t-programs"] } }),
  ]);
  assert.deepEqual(ids.types.sort(), ["t-old", "t-programs"]);
  assert.deepEqual(ids.companies, ["co1"]);
});

test("restoring puts back the form's fields and nothing else", () => {
  const patch = restorePatch(SNAPSHOT);
  for (const key of ["id", "kind", "created_at", "updated_at", "created_by", "deleted_at"]) assert.ok(!(key in patch), key);
  assert.equal(patch.name, "Des Moines Warriors");
  assert.deepEqual(patch.aliases, ["DMW"]);
  assert.ok(Object.keys(patch).every((k) => CONTACT_FIELDS.some((f) => f.key === k)));
  // Lists come back as lists even if the version didn't have one.
  assert.deepEqual(restorePatch({ ...SNAPSHOT, tags: null }).tags, []);

  assert.equal(differsFrom(SNAPSHOT, { ...SNAPSHOT, updated_at: "later" }), false);
  assert.equal(differsFrom(SNAPSHOT, { ...SNAPSHOT, phone: "402-555-0100" }), true);
  assert.equal(differsFrom(SNAPSHOT, { ...SNAPSHOT, tags: ["nchc", "host"] }), true);
});
