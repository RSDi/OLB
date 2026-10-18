// Hashed keys for /api/agent/*. Plaintext is shown once when a super-admin
// creates a key in Settings → Agent keys; only the hash is stored. Scopes
// (0149) pick read vs email_archive:write. Same v1.<salt>.<digest> shape as
// family film codes.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const AGENT_KEY_TOKEN_PREFIX = "olb_ag_";
export const AGENT_KEY_DISPLAY_PREFIX_LEN = 16;
export const AGENT_KEY_NAME_MAX = 80;
export const MAX_ACTIVE_AGENT_KEYS = 20;

const BEARER = "Bearer ";

export function generateAgentKey(): string {
  return AGENT_KEY_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function agentKeyDisplayPrefix(key: string): string {
  return key.slice(0, AGENT_KEY_DISPLAY_PREFIX_LEN);
}

export function cleanAgentKeyName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Give the key a name." };
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return { ok: false, error: "Give the key a name." };
  if (name.length > AGENT_KEY_NAME_MAX) return { ok: false, error: `Keep the name to ${AGENT_KEY_NAME_MAX} characters.` };
  return { ok: true, name };
}

export function hashAgentKey(key: string, salt = randomBytes(16).toString("base64url")): string {
  const digest = createHash("sha256").update(`${salt}:${key}`).digest("base64url");
  return `v1.${salt}.${digest}`;
}

export function agentKeyMatches(stored: string | null | undefined, submitted: unknown): boolean {
  if (!stored || typeof submitted !== "string" || !submitted) return false;
  const parts = stored.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const [, salt] = parts;
  if (!salt) return false;
  const expected = Buffer.from(stored);
  const actual = Buffer.from(hashAgentKey(submitted, salt));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function bearerToken(authorization: string | null | undefined): string {
  if (!authorization?.startsWith(BEARER)) return "";
  return authorization.slice(BEARER.length).trim();
}

// True when the Bearer token matches one of the stored hashes. An empty list
// (no keys minted, or the table is missing) is a miss, same as a wrong token.
export function agentAuthorized(authorization: string | null, hashes: string[]): boolean {
  const got = bearerToken(authorization);
  if (!got || hashes.length === 0) return false;
  let ok = false;
  for (const stored of hashes) {
    if (agentKeyMatches(stored, got)) ok = true;
  }
  return ok;
}

export type PublicAgentKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  scopes: string[];
};

export function publicAgentKey(row: {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  scopes?: string[] | null;
}): PublicAgentKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    createdAt: row.created_at,
    scopes: Array.isArray(row.scopes) && row.scopes.length ? row.scopes : ["read"],
  };
}
