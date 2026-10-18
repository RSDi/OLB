import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanAgentScopes, keyHasScope } from "../../lib/agent/scopes.ts";

test("scopes are an explicit allow-list", () => {
  assert.deepEqual(cleanAgentScopes(["read"]), { ok: true, scopes: ["read"] });
  assert.deepEqual(cleanAgentScopes(["read", "email_archive:write"]), {
    ok: true,
    scopes: ["read", "email_archive:write"],
  });
  assert.equal(cleanAgentScopes([]).ok, false);
  assert.equal(cleanAgentScopes(["write"]).ok, false);
  assert.equal(cleanAgentScopes(["email_archive:write", "email_archive:write"]).ok, true);
  assert.equal(keyHasScope(["read"], "read"), true);
  assert.equal(keyHasScope(["read"], "email_archive:write"), false);
  assert.equal(keyHasScope(["email_archive:write"], "read"), false);
});
