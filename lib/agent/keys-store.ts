// Service-role access to olb_agent_keys. Callers must already have passed
// requireSuperAdmin (Settings) or the Bearer check (API).

import { createAdminClient } from "../supabase/admin.ts";
import {
  agentKeyDisplayPrefix,
  generateAgentKey,
  hashAgentKey,
  publicAgentKey,
  MAX_ACTIVE_AGENT_KEYS,
  type PublicAgentKey,
} from "./keys.ts";
import { columnMissing, relationMissing } from "./schema.ts";
import type { AgentScope } from "./scopes.ts";

export type StoredAgentKey = { hash: string; scopes: string[] };

function scopesFromRow(row: { scopes?: string[] | null }): string[] {
  return Array.isArray(row.scopes) && row.scopes.length ? row.scopes : ["read"];
}

export async function listActiveAgentKeys(): Promise<StoredAgentKey[] | { missingTable: true }> {
  const admin = createAdminClient();
  const withScopes = await admin.from("olb_agent_keys").select("key_hash, scopes").is("revoked_at", null);
  if (withScopes.error) {
    if (relationMissing(withScopes.error.message, "olb_agent_keys")) return { missingTable: true };
    if (columnMissing(withScopes.error.message, "scopes")) {
      const { data, error } = await admin.from("olb_agent_keys").select("key_hash").is("revoked_at", null);
      if (error) {
        if (relationMissing(error.message, "olb_agent_keys")) return { missingTable: true };
        throw new Error(error.message);
      }
      return ((data as { key_hash: string }[] | null) ?? []).map((row) => ({ hash: row.key_hash, scopes: ["read"] }));
    }
    throw new Error(withScopes.error.message);
  }
  return ((withScopes.data as { key_hash: string; scopes: string[] | null }[] | null) ?? []).map((row) => ({
    hash: row.key_hash,
    scopes: scopesFromRow(row),
  }));
}

export async function listActiveAgentKeyHashes(): Promise<string[] | { missingTable: true }> {
  const keys = await listActiveAgentKeys();
  if ("missingTable" in keys) return keys;
  return keys.map((k) => k.hash);
}

export async function listPublicAgentKeys(): Promise<PublicAgentKey[] | { missingTable: true }> {
  const admin = createAdminClient();
  const withScopes = await admin
    .from("olb_agent_keys")
    .select("id, name, key_prefix, created_at, scopes")
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (withScopes.error) {
    if (relationMissing(withScopes.error.message, "olb_agent_keys")) return { missingTable: true };
    if (columnMissing(withScopes.error.message, "scopes")) {
      const { data, error } = await admin
        .from("olb_agent_keys")
        .select("id, name, key_prefix, created_at")
        .is("revoked_at", null)
        .order("created_at", { ascending: false });
      if (error) {
        if (relationMissing(error.message, "olb_agent_keys")) return { missingTable: true };
        throw new Error(error.message);
      }
      return ((data as { id: string; name: string; key_prefix: string; created_at: string }[] | null) ?? []).map(
        publicAgentKey,
      );
    }
    throw new Error(withScopes.error.message);
  }
  return (
    (withScopes.data as { id: string; name: string; key_prefix: string; created_at: string; scopes: string[] | null }[] | null) ??
    []
  ).map(publicAgentKey);
}

export async function insertAgentKey(input: {
  name: string;
  createdBy: string;
  scopes: AgentScope[];
}): Promise<{ key: string; item: PublicAgentKey } | { error: string }> {
  const admin = createAdminClient();
  const { count, error: countError } = await admin
    .from("olb_agent_keys")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if (countError) {
    if (relationMissing(countError.message, "olb_agent_keys")) {
      return { error: "Run migration 0146 (agent keys) in the Supabase SQL editor first." };
    }
    return { error: countError.message };
  }
  if ((count ?? 0) >= MAX_ACTIVE_AGENT_KEYS) {
    return { error: `Revoke an unused key first (limit ${MAX_ACTIVE_AGENT_KEYS}).` };
  }
  const key = generateAgentKey();
  const insertWithScopes = await admin
    .from("olb_agent_keys")
    .insert({
      name: input.name,
      key_prefix: agentKeyDisplayPrefix(key),
      key_hash: hashAgentKey(key),
      created_by: input.createdBy,
      scopes: input.scopes,
    })
    .select("id, name, key_prefix, created_at, scopes")
    .single();
  if (insertWithScopes.error && columnMissing(insertWithScopes.error.message, "scopes")) {
    if (input.scopes.includes("email_archive:write")) {
      return { error: "Run migration 0149 (email archive) in the Supabase SQL editor first — that's what adds write scopes." };
    }
    const { data, error } = await admin
      .from("olb_agent_keys")
      .insert({
        name: input.name,
        key_prefix: agentKeyDisplayPrefix(key),
        key_hash: hashAgentKey(key),
        created_by: input.createdBy,
      })
      .select("id, name, key_prefix, created_at")
      .single();
    if (error || !data) {
      if (error && relationMissing(error.message, "olb_agent_keys")) {
        return { error: "Run migration 0146 (agent keys) in the Supabase SQL editor first." };
      }
      return { error: error?.message ?? "Couldn't create the key." };
    }
    return { key, item: publicAgentKey(data) };
  }
  if (insertWithScopes.error || !insertWithScopes.data) {
    if (insertWithScopes.error && relationMissing(insertWithScopes.error.message, "olb_agent_keys")) {
      return { error: "Run migration 0146 (agent keys) in the Supabase SQL editor first." };
    }
    return { error: insertWithScopes.error?.message ?? "Couldn't create the key." };
  }
  return { key, item: publicAgentKey(insertWithScopes.data) };
}

export async function revokeAgentKeyRow(id: string): Promise<{ ok: true } | { error: string }> {
  if (!id) return { error: "That key isn't there any more." };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("olb_agent_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    if (relationMissing(error.message, "olb_agent_keys")) {
      return { error: "Run migration 0146 (agent keys) in the Supabase SQL editor first." };
    }
    return { error: error.message };
  }
  if (!data) return { error: "That key isn't there any more." };
  return { ok: true };
}
