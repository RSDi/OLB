import { test } from "node:test";
import assert from "node:assert/strict";
import { keyOpens, keyProblem, randomKey } from "../../lib/teams/public-directory-key.ts";

test("keyProblem: long, link-safe keys only", () => {
  assert.equal(keyProblem("abcdefghijklmnop"), null);
  assert.equal(keyProblem("A_b-C_d-E_f-G_h-1234"), null);
  assert.match(keyProblem("short")!, /at least 16/);
  assert.match(keyProblem("has spaces in it ok")!, /only letters/);
  assert.match(keyProblem("slash/in/the/key/here")!, /only letters/);
  assert.match(keyProblem("x".repeat(129))!, /128/);
});

test("randomKey: 32 link-safe characters, different each time", () => {
  const a = randomKey();
  assert.equal(a.length, 32);
  assert.equal(keyProblem(a), null);
  assert.notEqual(a, randomKey());
});

test("keyOpens: only the saved key, and nothing when the page is off", () => {
  const saved = "_UJ2xLmjOBjO4ia1099ci-Ickwp086dJ";
  assert.equal(keyOpens(saved, saved), true);
  assert.equal(keyOpens(saved.slice(0, -1) + "K", saved), false);
  assert.equal(keyOpens(saved.slice(0, -1), saved), false);
  assert.equal(keyOpens("", null), false);
  assert.equal(keyOpens("anything-at-all-here", null), false);
  // A saved key that's too short to be safe opens nothing.
  assert.equal(keyOpens("short", "short"), false);
});
