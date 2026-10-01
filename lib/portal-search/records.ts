// The portal search's database side: run the portal's own search functions
// for the question and for each of its words, and load the full text of the
// records they find for the AI answer.
//
// Everything runs as the signed-in person (the server client carries their
// session), so row-level security decides what they can find and what the
// AI reads, exactly as in the top-bar search. Nobody's answer can draw on a
// record they couldn't open themselves.

import { embed } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntityType, SearchHit } from "../search/useGlobalSearch";
import { CHURCH_TZ } from "../dates/today";
import { EMBEDDING_MODEL, groupChunkHits, type ChunkRow } from "./chunks";
import type { RankedHit, RecordText, TermHits } from "./query";

interface ArchiveRow {
  id: string;
  channel_id: string;
  channel_label: string | null;
  ts: string;
  author_name: string | null;
  message_text: string;
  posted_at: string;
  rank: number;
}

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: CHURCH_TZ,
});
const DAY_TIME = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
});
// Plain dates ("2026-10-06", as start_on and due_on are stored) are already
// the club's local day: read them at noon UTC so no timezone moves them.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: string | null | undefined) =>
  v ? DAY.format(new Date(DATE_ONLY.test(v) ? `${v}T12:00:00Z` : v)) : null;
const dayTime = (v: string | null | undefined) => (v ? DAY_TIME.format(new Date(v)) : null);

// Slack messages, found and kept whole: the message is its own full text.
async function searchSlack(
  supabase: SupabaseClient,
  term: string,
  whole: boolean,
  texts: RecordText,
): Promise<TermHits> {
  const { data, error } = await supabase.rpc("archive_search_global", { p_query: term, p_limit: 8 });
  if (error) {
    console.error("[portal-search] Slack archive search failed", error);
    return { term, whole, hits: [] };
  }
  const hits = ((data ?? []) as ArchiveRow[]).map((row): SearchHit => {
    const where = row.channel_label ?? row.channel_id;
    texts.set(
      `slack:${row.id}`,
      [`Posted in #${where} by ${row.author_name ?? "someone"} on ${dayTime(row.posted_at)}`, row.message_text].join("\n"),
    );
    return {
      entity_type: "slack",
      id: row.id,
      title: row.message_text.replace(/\s+/g, " ").slice(0, 140),
      subtitle: [where, row.author_name, day(row.posted_at)].filter(Boolean).join(" · "),
      href: `/portal/slack-archive/${encodeURIComponent(row.channel_id)}#msg-${row.ts}`,
      rank: row.rank,
    };
  });
  return { term, whole, hits };
}

async function searchRecords(supabase: SupabaseClient, term: string, whole: boolean): Promise<TermHits> {
  const { data, error } = await supabase.rpc("search_global", { q: term, max_total: 40 });
  if (error) {
    console.error("[portal-search] search_global failed", error);
    return { term, whole, hits: [] };
  }
  return { term, whole, hits: (data ?? []) as SearchHit[] };
}

// Search by meaning (search_hybrid, migration 0113): the question embedded
// and compared with the indexed chunks, blended with a keyword match on the
// same chunks. Runs as the member, so the chunks' policy limits it to what
// they can see. Each record's matched text goes into `texts` for the AI.
// Before 0113 is applied, or if the embedding call fails, it finds nothing
// and the keyword searches carry on alone; that's logged once.
let meaningWarned = false;
async function searchMeaning(supabase: SupabaseClient, query: string, texts: RecordText): Promise<TermHits> {
  const none = { term: query, whole: true, hits: [] };
  try {
    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: query });
    const { data, error } = await supabase.rpc("search_hybrid", {
      query_embedding: JSON.stringify(embedding),
      query_text: query,
      match_count: 30,
    });
    if (error) throw new Error(error.message);
    const { hits, texts: matched } = groupChunkHits((data ?? []) as ChunkRow[]);
    for (const [key, text] of matched) if (!texts.has(key)) texts.set(key, text);
    return { term: query, whole: true, hits };
  } catch (err) {
    if (!meaningWarned) console.error("[portal-search] search by meaning unavailable:", err instanceof Error ? err.message : err);
    meaningWarned = true;
    return none;
  }
}

// The whole question (when it's short enough to appear word for word) plus
// each of its words, through both keyword search functions, and the whole
// question by meaning, all at once. Slack's keyword search needs every word
// it's given, so it also gets all the words together.
export async function runSearches(
  supabase: SupabaseClient,
  query: string,
  terms: string[],
  texts: RecordText,
): Promise<TermHits[]> {
  const searches: Array<Promise<TermHits>> = [searchMeaning(supabase, query, texts)];
  const phrase = query.trim();
  if (phrase.split(/\s+/).length <= 5) searches.push(searchRecords(supabase, phrase, true));
  for (const t of terms) {
    searches.push(searchRecords(supabase, t, false));
    searches.push(searchSlack(supabase, t, false, texts));
  }
  if (terms.length > 1) searches.push(searchSlack(supabase, terms.join(" "), true, texts));
  return Promise.all(searches);
}

const lines = (...parts: Array<string | null | undefined | false>) =>
  parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join("\n");
const field = (label: string, v: unknown) =>
  v === null || v === undefined || v === "" ? null : `${label}: ${Array.isArray(v) ? v.join(", ") : String(v)}`;

type Row = Record<string, unknown> & { id: string };

async function load(supabase: SupabaseClient, table: string, columns: string, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from(table).select(columns).in("id", ids);
  if (error) {
    console.error(`[portal-search] loading ${table} failed`, error);
    return [];
  }
  return (data ?? []) as unknown as Row[];
}

// The full text of each record the AI will read, keyed like the hits. A
// record that fails to load falls back to its search-result title and line.
export async function loadRecordTexts(supabase: SupabaseClient, hits: RankedHit[], texts: RecordText): Promise<void> {
  const ids = (type: EntityType) => hits.filter((h) => h.entity_type === type).map((h) => h.id);
  const put = (type: EntityType, rows: Row[], text: (r: Row) => string) => {
    for (const r of rows) texts.set(`${type}:${r.id}`, text(r));
  };

  const taskIds = ids("maintenance");
  const [members, contacts, tasks, comments, pmTasks, pmTemplates, assets, events, playbooks] = await Promise.all([
    load(supabase, "members", "id, full_name, nickname, email, phone, home_phone, address, role", ids("member")),
    load(supabase, "contacts", "id, name, nickname, kind, email, phone, mobile_phone, website, address, notes, tags", ids("contact")),
    load(supabase, "maintenance_requests", "id, description, details, status, start_on, due_on, created_at", taskIds),
    taskIds.length
      ? supabase
          .from("ticket_comments")
          .select("ticket_id, body, created_at")
          .in("ticket_id", taskIds)
          .is("deleted_at", null)
          .order("created_at")
          .limit(60)
          .then(({ data, error }) => {
            if (error) console.error("[portal-search] loading ticket_comments failed", error);
            return (data ?? []) as Array<{ ticket_id: string; body: string; created_at: string }>;
          })
      : Promise.resolve([]),
    load(supabase, "pm_instances", "id, title, description, status, scheduled_for, notes", ids("pm_task")),
    load(supabase, "pm_templates", "id, title, description", ids("pm_template")),
    load(supabase, "assets", "id, name, type, notes", ids("asset")),
    load(supabase, "events", "id, title, description, start_at, end_at, location", ids("event")),
    load(supabase, "playbooks", "id, title, excerpt, body_md", ids("playbook")),
  ]);

  put("member", members, (r) =>
    lines(
      field("Name", r.full_name), field("Goes by", r.nickname), field("Role", r.role), field("Email", r.email),
      field("Phone", r.phone), field("Home phone", r.home_phone), field("Address", r.address),
    ));
  put("contact", contacts, (r) =>
    lines(
      field("Name", r.name), field("Goes by", r.nickname), field("Kind", r.kind), field("Email", r.email),
      field("Phone", r.phone), field("Mobile", r.mobile_phone), field("Website", r.website),
      field("Address", r.address), field("Tags", r.tags), field("Notes", r.notes),
    ));
  put("maintenance", tasks, (r) =>
    lines(
      field("Task", r.description), field("Status", r.status), field("Starts", day(r.start_on as string)),
      field("Due", day(r.due_on as string)), field("Opened", day(r.created_at as string)), field("Details", r.details),
      ...comments.filter((c) => c.ticket_id === r.id).map((c) => `Comment (${day(c.created_at)}): ${c.body}`),
    ));
  put("pm_task", pmTasks, (r) =>
    lines(
      field("PM task", r.title), field("Status", r.status), field("Scheduled for", day(r.scheduled_for as string)),
      field("Description", r.description), field("Notes", r.notes),
    ));
  put("pm_template", pmTemplates, (r) => lines(field("PM template", r.title), field("Description", r.description)));
  put("asset", assets, (r) => lines(field("Asset", r.name), field("Type", r.type), field("Notes", r.notes)));
  put("event", events, (r) =>
    lines(
      field("Event", r.title), field("Starts", dayTime(r.start_at as string)), field("Ends", dayTime(r.end_at as string)),
      field("Location", r.location), field("Description", r.description),
    ));
  put("playbook", playbooks, (r) => lines(field("Playbook", r.title), field("Summary", r.excerpt), r.body_md as string));
}
