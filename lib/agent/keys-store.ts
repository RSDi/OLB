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
import { relationMissing } from "./schema.ts";

export async function listActiveAgentKeyHashes(): Promise<string[] | { missingTable: true }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("olb_agent_keys").select("key_hash").is("revoked_at", null);
  if (error) {
    if (relationMissing(error.message, "olb_agent_keys")) return { missingTable: true };
    throw new Error(error.message);
  }
  return ((data as { key_hash: string }[] | null) ?? []).map((row) => row.key_hash);
}

export async function listPublicAgentKeys(): Promise<PublicAgentKey[] | { missingTable: true }> {
  const admin = createAdminClient();
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

export async function insertAgentKey(input: {
  name: string;
  createdBy: string;
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
