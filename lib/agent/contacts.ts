// Read-only External Contacts for /api/agent/contacts. Matching and mapping
// are pure so tests can pin the JSON; ./contacts-load.ts hits the database.
// Never return phones, addresses, tax ids, account numbers, or notes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AGENT_CONTACTS_MAX_EMAILS = 50;
export const AGENT_CONTACTS_DEFAULT_LIMIT = 25;
export const AGENT_CONTACTS_MAX_LIMIT = 100;

export type AgentContactKind = "person" | "company";

export type AgentContactsQuery = {
  emails: string[];
  q: string | null;
  kind: AgentContactKind | null;
  parentId: string | null;
  limit: number;
};

// The only columns the loader selects.
export type AgentContactRow = {
  id: string;
  kind: string;
  name: string;
  nickname: string | null;
  title: string | null;
  email: string | null;
  alt_email: string | null;
  parent_contact_id: string | null;
  category_id: string | null;
  city: string | null;
  state: string | null;
  aliases: string[] | null;
  deleted_at: string | null;
};

export type AgentContactMatch = "email" | "alt_email" | "q";

export type AgentContact = {
  id: string;
  kind: AgentContactKind;
  name: string;
  nickname: string | null;
  title: string | null;
  email: string | null;
  altEmail: string | null;
  matchedOn: AgentContactMatch;
  parent: { id: string; name: string } | null;
  category: { id: string; name: string } | null;
  city: string | null;
  state: string | null;
  aliases: string[];
};

export type AgentContactsResult = { contacts: AgentContact[]; missing: string[] };

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function parseContactsQuery(params: URLSearchParams): AgentContactsQuery | { error: string } {
  const emails: string[] = [];
  for (const value of params.getAll("email")) {
    for (const part of value.split(",")) {
      const e = normalizeEmail(part);
      if (!e) continue;
      if (!e.includes("@")) return { error: `"${part.trim()}" isn't an email address.` };
      if (!emails.includes(e)) emails.push(e);
    }
  }
  if (emails.length > AGENT_CONTACTS_MAX_EMAILS) {
    return { error: `Send at most ${AGENT_CONTACTS_MAX_EMAILS} emails per call.` };
  }

  const qRaw = params.get("q")?.trim() ?? "";
  if (qRaw && qRaw.length < 2) return { error: "q needs at least 2 characters." };
  const q = qRaw || null;

  if (!emails.length && !q) return { error: "Send email= or q=." };

  const kindRaw = params.get("kind")?.trim().toLowerCase() || null;
  if (kindRaw && kindRaw !== "person" && kindRaw !== "company") {
    return { error: "kind is person or company." };
  }

  const parentId = params.get("parent_id")?.trim() || null;
  if (parentId && !UUID_RE.test(parentId)) return { error: "parent_id must be a contact id." };

  let limit = AGENT_CONTACTS_DEFAULT_LIMIT;
  const limitRaw = params.get("limit")?.trim();
  if (limitRaw) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) return { error: "limit is a whole number." };
    limit = Math.min(n, AGENT_CONTACTS_MAX_LIMIT);
  }

  return { emails, q, kind: kindRaw as AgentContactKind | null, parentId: parentId?.toLowerCase() ?? null, limit };
}

function textHit(value: string | null | undefined, needle: string): boolean {
  return !!value && value.toLowerCase().includes(needle);
}

function toAgentContact(
  row: AgentContactRow,
  matchedOn: AgentContactMatch,
  byId: Map<string, AgentContactRow>,
  categories: Map<string, string>,
): AgentContact {
  const parentRow = row.parent_contact_id ? byId.get(row.parent_contact_id) : undefined;
  const categoryName = row.category_id ? categories.get(row.category_id) : undefined;
  return {
    id: row.id,
    kind: row.kind === "company" ? "company" : "person",
    name: row.name,
    nickname: row.nickname?.trim() || null,
    title: row.title?.trim() || null,
    email: row.email?.trim() || null,
    altEmail: row.alt_email?.trim() || null,
    matchedOn,
    parent: parentRow ? { id: parentRow.id, name: parentRow.name } : null,
    category: row.category_id && categoryName ? { id: row.category_id, name: categoryName } : null,
    city: row.city?.trim() || null,
    state: row.state?.trim() || null,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter((a) => typeof a === "string" && a.trim()) : [],
  };
}

// Email hits first (every one, so a batch never drops a match), then q hits
// up to `limit`. kind and parent_id narrow both. `missing` lists requested
// emails that matched nothing after those filters.
export function matchAgentContacts(
  rows: AgentContactRow[],
  categories: Map<string, string>,
  query: AgentContactsQuery,
): AgentContactsResult {
  const live = rows.filter((r) => !r.deleted_at);
  const byId = new Map(live.map((r) => [r.id, r]));
  const passes = (r: AgentContactRow) =>
    (!query.kind || r.kind === query.kind) &&
    (!query.parentId || (r.parent_contact_id ?? "").toLowerCase() === query.parentId);

  const contacts: AgentContact[] = [];
  const seen = new Set<string>();
  const found = new Set<string>();

  if (query.emails.length) {
    const wanted = new Set(query.emails);
    for (const r of live) {
      if (!passes(r)) continue;
      const e = normalizeEmail(r.email);
      const alt = normalizeEmail(r.alt_email);
      let matchedOn: AgentContactMatch | null = null;
      if (e && wanted.has(e)) {
        matchedOn = "email";
        found.add(e);
      }
      if (alt && wanted.has(alt)) {
        matchedOn ??= "alt_email";
        found.add(alt);
      }
      if (matchedOn && !seen.has(r.id)) {
        seen.add(r.id);
        contacts.push(toAgentContact(r, matchedOn, byId, categories));
      }
    }
  }

  if (query.q) {
    const needle = query.q.toLowerCase();
    let added = 0;
    const sorted = [...live].sort((a, b) => a.name.localeCompare(b.name));
    for (const r of sorted) {
      if (added >= query.limit) break;
      if (seen.has(r.id) || !passes(r)) continue;
      const hit =
        textHit(r.name, needle) ||
        textHit(r.nickname, needle) ||
        textHit(r.title, needle) ||
        (r.aliases ?? []).some((a) => textHit(a, needle));
      if (!hit) continue;
      seen.add(r.id);
      added++;
      contacts.push(toAgentContact(r, "q", byId, categories));
    }
  }

  return { contacts, missing: query.emails.filter((e) => !found.has(e)) };
}
