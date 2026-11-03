// Database reads for /api/agent/contacts. Matching lives in ./contacts.ts.
// The select names only the fields the agent may see (plus deleted_at), so
// phones, addresses, tax ids, account numbers and notes never leave Postgres.

import { createAdminClient } from "../supabase/admin.ts";
import { matchAgentContacts, type AgentContactRow, type AgentContactsQuery, type AgentContactsResult } from "./contacts.ts";

const COLUMNS =
  "id, kind, name, nickname, title, email, alt_email, parent_contact_id, category_id, city, state, aliases, deleted_at";
const PAGE = 1000;

async function loadLiveContacts(): Promise<AgentContactRow[]> {
  const admin = createAdminClient();
  const rows: AgentContactRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("contacts")
      .select(COLUMNS)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data as AgentContactRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function loadCategories(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("contact_categories").select("id, name").is("deleted_at", null);
  if (error) throw new Error(error.message);
  return new Map(((data as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c.name]));
}

export async function findAgentContacts(query: AgentContactsQuery): Promise<AgentContactsResult> {
  const [rows, categories] = await Promise.all([loadLiveContacts(), loadCategories()]);
  return matchAgentContacts(rows, categories, query);
}
