"use server";
// Settings → Agent keys. Super-admin only. The plaintext key is returned
// once from createAgentKey; list/revoke never see it.

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards.ts";
import { cleanAgentKeyName, type PublicAgentKey } from "./keys.ts";
import { cleanAgentScopes } from "./scopes.ts";
import { insertAgentKey, listPublicAgentKeys, revokeAgentKeyRow } from "./keys-store.ts";

function refresh() {
  revalidatePath("/portal/settings");
}

export async function loadAgentKeys(): Promise<{ keys: PublicAgentKey[] } | { error: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  try {
    const keys = await listPublicAgentKeys();
    if ("missingTable" in keys) {
      return { error: "Run migration 0146 (agent keys) in the Supabase SQL editor first." };
    }
    return { keys };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't load agent keys." };
  }
}

export async function createAgentKey(
  name: unknown,
  scopes?: unknown,
): Promise<{ key: string; item: PublicAgentKey } | { error: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const cleaned = cleanAgentKeyName(name);
  if (!cleaned.ok) return { error: cleaned.error };
  const wanted = cleanAgentScopes(scopes);
  if (!wanted.ok) return { error: wanted.error };
  const res = await insertAgentKey({ name: cleaned.name, createdBy: gate.userId, scopes: wanted.scopes });
  if ("error" in res) return res;
  refresh();
  return res;
}

export async function revokeAgentKey(id: string): Promise<{ ok: true } | { error: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const res = await revokeAgentKeyRow(id);
  if ("ok" in res) refresh();
  return res;
}
