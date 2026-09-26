// Unit tests for exactRegex, the .regexIMatch() pattern used to look up a
// member by email. JS regex syntax agrees with Postgres for everything the
// helper escapes, so these check the pattern here; Postgres runs the real
// match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exactRegex } from "../../lib/supabase/filters.ts";

const matches = (value: string, candidate: string) => new RegExp(exactRegex(value), "iu").test(candidate);

test("escapes regex metacharacters and anchors both ends", () => {
  assert.equal(exactRegex("a.b*c"), "^a\\.b\\*c$");
  assert.equal(exactRegex("\\^$.*+?()[]{}|"), "^\\\\\\^\\$\\.\\*\\+\\?\\(\\)\\[\\]\\{\\}\\|$");
});

test("leaves ordinary email characters alone", () => {
  assert.equal(exactRegex("john_smith%x@example.com"), "^john_smith%x@example\\.com$");
});

test("matches the same address in any case", () => {
  assert.ok(matches("jane.doe@example.com", "Jane.Doe@Example.com"));
  assert.ok(matches("kim+olb@example.com", "Kim+OLB@example.com"));
});

test("matches no other address", () => {
  assert.ok(!matches("john_smith@example.com", "john.smith@example.com"));
  assert.ok(!matches("john.smith@example.com", "johnxsmith@example.com"));
  assert.ok(!matches("pat*lee@example.com", "pat.lee@example.com"));
  assert.ok(!matches("pat*lee@example.com", "patlee@example.com"));
  assert.ok(!matches("sam%ray@example.com", "sam.ray@example.com"));
  assert.ok(!matches("kim+olb@example.com", "kimmolb@example.com"));
  assert.ok(!matches("john.smith@example.com", "xjohn.smith@example.com"));
  assert.ok(!matches("john.smith@example.com", "john.smith@example.com.au"));
});

test("every character allowed in an email's local part matches only itself", () => {
  for (const c of "!#$%&'*+-/=?^_`{|}~.") {
    const email = `a${c}b@example.com`;
    assert.ok(matches(email, email.toUpperCase()), email);
    assert.ok(!matches(email, "axb@example.com"), email);
  }
});
