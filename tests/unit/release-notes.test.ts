import { test } from "node:test";
import assert from "node:assert/strict";
import { RELEASES } from "../../lib/release-notes/releases.ts";

test("release notes have unique ids and a date, title, summary and body", () => {
  const ids = RELEASES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of RELEASES) {
    assert.match(r.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.title.trim());
    assert.ok(r.summary.trim().length > 10, r.id);
    assert.ok(r.body.trim().length > 40, r.id);
    assert.ok(["everyone", "staff", "super_admin"].includes(r.audience), r.id);
  }
});

test("age eligibility shipped in the 16 Oct 2026 notes", () => {
  const note = RELEASES.find((r) => r.id === "2026-10-16-age-eligibility");
  assert.ok(note);
  assert.equal(note!.audience, "staff");
  assert.match(note!.body, /Settings → Season/);
  assert.match(note!.body, /Available to swing up/);
  assert.match(note!.body, /Ages out/);
});
