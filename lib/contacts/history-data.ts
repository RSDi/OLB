// Loading contact history (contact_versions, migration 0109) for the board,
// with the names it mentions: who made each change, and the types and
// companies its fields point at. RLS: only the board reads it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { namesForUsers } from "../planning/data";
import { CONTACT_VERSION_COLUMNS, referencedIds, type ContactVersion, type HistoryLookups } from "./history";

export interface ContactHistory {
  // False before migration 0109 (no contact_versions table yet).
  ok: boolean;
  versions: ContactVersion[];
  // Who made the changes (and who was previewing as them), by user id.
  names: Map<string, string>;
  lookups: HistoryLookups;
}

async function resolve(supabase: SupabaseClient, versions: ContactVersion[]): Promise<Omit<ContactHistory, "ok" | "versions">> {
  const ids = referencedIds(versions);
  const [names, types, companies] = await Promise.all([
    namesForUsers(supabase, versions.flatMap((v) => [v.changed_by, v.impersonator_user_id])),
    ids.types.length
      ? supabase.from("contact_categories").select("id, name").in("id", ids.types).then(({ data }) => data)
      : Promise.resolve([]),
    ids.companies.length
      ? supabase.from("contacts").select("id, name").in("id", ids.companies).then(({ data }) => data)
      : Promise.resolve([]),
  ]);
  const byId = (rows: unknown) => new Map(((rows as { id: string; name: string }[] | null) ?? []).map((r) => [r.id, r.name]));
  return { names, lookups: { types: byId(types), companies: byId(companies) } };
}

// Every change to one contact, newest first.
export async function loadContactHistory(supabase: SupabaseClient, contactId: string): Promise<ContactHistory> {
  const { data, error } = await supabase
    .from("contact_versions")
    .select(CONTACT_VERSION_COLUMNS)
    .eq("contact_id", contactId)
    .order("changed_at", { ascending: false })
    .limit(500);
  if (error) return { ok: false, versions: [], names: new Map(), lookups: { types: new Map(), companies: new Map() } };
  const versions = (data as ContactVersion[] | null) ?? [];
  return { ok: true, versions, ...(await resolve(supabase, versions)) };
}

// The latest changes to every contact, newest first (not where each one's
// history starts: that's just what it held when history began).
export async function loadRecentContactChanges(supabase: SupabaseClient, limit = 150): Promise<ContactHistory> {
  const { data, error } = await supabase
    .from("contact_versions")
    .select(CONTACT_VERSION_COLUMNS)
    .neq("action", "start")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, versions: [], names: new Map(), lookups: { types: new Map(), companies: new Map() } };
  const versions = (data as ContactVersion[] | null) ?? [];
  return { ok: true, versions, ...(await resolve(supabase, versions)) };
}

export interface LastContactChange {
  at: string;
  by: string | null;
  action: ContactVersion["action"];
  source: ContactVersion["source"];
}

// The contact's latest change, for "Last changed by … · when". Null before
// 0109, or while it has nothing but where its history starts.
export async function loadLastContactChange(supabase: SupabaseClient, contactId: string): Promise<LastContactChange | null> {
  const { data, error } = await supabase
    .from("contact_versions")
    .select("action, source, changed_by, changed_at")
    .eq("contact_id", contactId)
    .neq("action", "start")
    .order("changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { action: ContactVersion["action"]; source: ContactVersion["source"]; changed_by: string | null; changed_at: string };
  const names = await namesForUsers(supabase, [row.changed_by]);
  return {
    at: row.changed_at,
    by: row.changed_by ? names.get(row.changed_by) ?? null : null,
    action: row.action,
    source: row.source,
  };
}
