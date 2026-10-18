import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_KEY_TOKEN_PREFIX,
  agentAuthorized,
  agentKeyDisplayPrefix,
  agentKeyMatches,
  bearerToken,
  cleanAgentKeyName,
  generateAgentKey,
  hashAgentKey,
  publicAgentKey,
} from "../../lib/agent/keys.ts";

test("agent keys are hashed; plaintext is not recoverable", () => {
  const key = generateAgentKey();
  assert.equal(key.startsWith(AGENT_KEY_TOKEN_PREFIX), true);
  const stored = hashAgentKey(key);
  assert.equal(stored.startsWith("v1."), true);
  assert.equal(stored.includes(key), false);
  assert.equal(agentKeyMatches(stored, key), true);
  assert.equal(agentKeyMatches(stored, key + "x"), false);
  assert.equal(agentKeyMatches(stored, key.toUpperCase()), false);
  assert.equal(agentKeyMatches(null, key), false);
  assert.equal(publicAgentKey({
    id: "k1",
    name: "Film reader",
    key_prefix: agentKeyDisplayPrefix(key),
    created_at: "2026-10-18T00:00:00.000Z",
  }).prefix.startsWith(AGENT_KEY_TOKEN_PREFIX), true);
  assert.equal("key_hash" in publicAgentKey({
    id: "k1",
    name: "Film reader",
    key_prefix: "olb_ag_abcd1234",
    created_at: "2026-10-18T00:00:00.000Z",
  }), false);
});

test("a matching Bearer key is accepted; anything else is not", () => {
  const key = generateAgentKey();
  const hashes = [hashAgentKey(key)];
  assert.equal(agentAuthorized(`Bearer ${key}`, hashes), true);
  assert.equal(agentAuthorized(`bearer ${key}`, hashes), false);
  assert.equal(agentAuthorized(key, hashes), false);
  assert.equal(agentAuthorized(`Bearer ${key}x`, hashes), false);
  assert.equal(agentAuthorized("Bearer ", hashes), false);
  assert.equal(agentAuthorized(null, hashes), false);
  assert.equal(agentAuthorized(`Bearer ${key}`, []), false);
  assert.equal(agentAuthorized(`Bearer ${key}`, [hashAgentKey(generateAgentKey())]), false);
  assert.equal(bearerToken(`Bearer ${key}`), key);
});

test("key names are trimmed labels, not secrets", () => {
  assert.deepEqual(cleanAgentKeyName("  Film reader  "), { ok: true, name: "Film reader" });
  assert.deepEqual(cleanAgentKeyName(""), { ok: false, error: "Give the key a name." });
  assert.deepEqual(cleanAgentKeyName("   "), { ok: false, error: "Give the key a name." });
  assert.deepEqual(cleanAgentKeyName(null), { ok: false, error: "Give the key a name." });
  assert.equal(cleanAgentKeyName("x".repeat(81)).ok, false);
});

test("agent routes are GET-only Bearer gates and never load YouTube secrets", () => {
  const film = readFileSync(join(import.meta.dirname, "../../app/api/agent/film/route.ts"), "utf8");
  const health = readFileSync(join(import.meta.dirname, "../../app/api/agent/film/health/route.ts"), "utf8");
  const http = readFileSync(join(import.meta.dirname, "../../lib/agent/auth-http.ts"), "utf8");
  const tab = readFileSync(join(import.meta.dirname, "../../app/portal/settings/AgentKeysTab.tsx"), "utf8");
  const actions = readFileSync(join(import.meta.dirname, "../../lib/agent/keys-actions.ts"), "utf8");
  for (const src of [film, health]) {
    assert.match(src, /export async function GET/);
    assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
    assert.match(src, /agentDeny/);
    assert.doesNotMatch(src, /getYoutubeConnectionSecret/);
    assert.doesNotMatch(src, /refresh_token/);
    assert.doesNotMatch(src, /film_code_hash/);
    assert.doesNotMatch(src, /CRON_SECRET/);
    assert.doesNotMatch(src, /OLB_ROADMAP_BOT_TOKEN/);
  }
  assert.match(http, /listActiveAgentKeyHashes/);
  assert.match(http, /unauthorized/);
  assert.match(tab, />\s*Create key\s*</);
  assert.match(tab, />\s*Revoke\s*</);
  assert.match(tab, /Copy this now/);
  assert.match(actions, /requireSuperAdmin/);
  assert.doesNotMatch(tab, /key_hash/);
});
