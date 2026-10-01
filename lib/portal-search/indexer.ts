// Keeps the search-by-meaning index (search_chunks, migration 0113) in step
// with the portal. Triggers add every changed record to search_index_queue;
// processIndexQueue works through it: it reloads each record, cuts it into
// chunks, embeds only the chunks whose text changed, and removes the chunks of
// records that are gone.
//
// Server-only: it uses the service-role client (the queue and the chunk
// writes are closed to members), and reads every record regardless of who
// can see it. Who can see a chunk is decided at search time, by the chunks'
// own policy. Runs after searches, nightly (/api/cron/search-index), and in
// one go with `npm run search-index`. Running twice at once is harmless: the
// writes are upserts, and a record re-queued mid-run stays queued.

import { embedMany, type EmbeddingModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
// Explicit extensions so node --test can load this file.
import { createAdminClient } from "../supabase/admin.ts";
import { CHURCH_TZ } from "../dates/today.ts";
import { chunkSections, EMBEDDING_DIMS, EMBEDDING_MODEL, hashText, markdownSections, type Section } from "./chunks.ts";

type Kind = "playbook" | "event" | "maintenance" | "pm_task" | "pm_template" | "asset" | "slack";

interface Doc {
  entityId: string;
  title: string;
  href: string;
  sections: Section[];
}

type Row = Record<string, unknown> & { id: string };

const WHEN = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: CHURCH_TZ });
const DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Plain dates ("2026-10-06") read at noon UTC, so no timezone moves them.
const date = (v: unknown) => (typeof v === "string" && v ? DATE.format(new Date(`${v.slice(0, 10)}T12:00:00Z`)) : null);
const lines = (...parts: Array<string | null | undefined | false>) =>
  parts.filter((p): p is string => typeof p === "string" && p.trim() !== "").join("\n");
const line = (label: string, v: unknown) => (v === null || v === undefined || v === "" ? null : `${label}: ${v}`);
const short = (s: string, n: number) => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
};

async function rows(admin: SupabaseClient, table: string, columns: string, ids: string[]): Promise<Row[]> {
  const { data, error } = await admin.from(table).select(columns).in("id", ids);
  if (error) throw new Error(`loading ${table}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

const alive = (r: Row) => !r.deleted_at;

// Each kind's records, as documents to chunk. A key with no document (deleted,
// or gone) has its chunks removed.
async function loadDocs(admin: SupabaseClient, kind: Kind, keys: string[]): Promise<Map<string, Doc>> {
  const docs = new Map<string, Doc>();
  if (kind === "slack") return loadSlackThreads(admin, keys);
  const ids = keys.filter((k) => /^[0-9a-f-]{36}$/i.test(k));
  if (!ids.length) return docs;

  if (kind === "playbook") {
    for (const r of (await rows(admin, "playbooks", "id, title, excerpt, body_md, deleted_at", ids)).filter(alive)) {
      const sections = [
        ...(r.excerpt ? [{ text: String(r.excerpt) }] : []),
        ...markdownSections(String(r.body_md ?? "")),
      ];
      docs.set(r.id, { entityId: r.id, title: String(r.title || "Playbook"), href: `/portal/docs/${r.id}`, sections });
    }
  } else if (kind === "event") {
    const cols = "id, title, description, location, start_at, end_at, recurring, recur_freq, recur_weekdays, recur_until, deleted_at";
    for (const r of (await rows(admin, "events", cols, ids)).filter(alive)) {
      const days = Array.isArray(r.recur_weekdays) ? (r.recur_weekdays as number[]).map((d) => WEEKDAYS[d]).filter(Boolean) : [];
      const repeats = r.recurring
        ? `Repeats ${r.recur_freq ?? "weekly"}${days.length ? ` on ${days.join(", ")}` : ""}${r.recur_until ? ` until ${date(r.recur_until)}` : ""}`
        : null;
      const text = lines(
        line("When", r.start_at ? WHEN.format(new Date(String(r.start_at))) : null),
        repeats,
        line("Location", r.location),
        r.description ? String(r.description) : null,
      );
      docs.set(r.id, { entityId: r.id, title: String(r.title || "Event"), href: `/portal/events/${r.id}/edit`, sections: [{ text }] });
    }
  } else if (kind === "maintenance") {
    const [tasks, comments] = await Promise.all([
      rows(admin, "maintenance_requests", "id, description, details, status, start_on, due_on, deleted_at", ids),
      admin
        .from("ticket_comments")
        .select("ticket_id, body, created_at")
        .in("ticket_id", ids)
        .is("deleted_at", null)
        .order("created_at")
        .then(({ data, error }) => {
          if (error) throw new Error(`loading ticket_comments: ${error.message}`);
          return (data ?? []) as Array<{ ticket_id: string; body: string; created_at: string }>;
        }),
    ]);
    for (const r of tasks.filter(alive)) {
      const said = comments.filter((c) => c.ticket_id === r.id && c.body?.trim());
      const sections: Section[] = [
        {
          text: lines(
            String(r.description ?? ""),
            line("Status", r.status),
            line("Starts", date(r.start_on)),
            line("Due", date(r.due_on)),
            r.details ? String(r.details) : null,
          ),
        },
        ...(said.length
          ? [{ heading: "Comments", text: said.map((c) => `${DAY.format(new Date(c.created_at))}: ${c.body.trim()}`).join("\n\n") }]
          : []),
      ];
      docs.set(r.id, { entityId: r.id, title: short(String(r.description || "Task"), 120), href: `/portal/tasks/${r.id}`, sections });
    }
  } else if (kind === "pm_task") {
    for (const r of (await rows(admin, "pm_instances", "id, title, description, notes, status, scheduled_for, deleted_at", ids)).filter(alive)) {
      const text = lines(line("Status", r.status), line("Scheduled for", date(r.scheduled_for)), r.description ? String(r.description) : null, r.notes ? String(r.notes) : null);
      docs.set(r.id, { entityId: r.id, title: String(r.title || "PM task"), href: `/portal/pm/${r.id}`, sections: [{ text }] });
    }
  } else if (kind === "pm_template") {
    for (const r of (await rows(admin, "pm_templates", "id, title, description, deleted_at", ids)).filter(alive)) {
      docs.set(r.id, { entityId: r.id, title: String(r.title || "PM template"), href: `/portal/pm/templates/${r.id}/edit`, sections: [{ text: String(r.description || r.title || "") }] });
    }
  } else if (kind === "asset") {
    for (const r of (await rows(admin, "assets", "id, name, type, notes, deleted_at", ids)).filter(alive)) {
      docs.set(r.id, { entityId: r.id, title: String(r.name || "Asset"), href: `/portal/pm/assets/${r.id}`, sections: [{ text: lines(line("Type", r.type), r.notes ? String(r.notes) : null) || String(r.name ?? "") }] });
    }
  }
  return docs;
}

// Slack keys are "<channel>|<thread ts>": the thread's first message and its
// replies, in order, as one document.
async function loadSlackThreads(admin: SupabaseClient, keys: string[]): Promise<Map<string, Doc>> {
  const docs = new Map<string, Doc>();
  const byChannel = new Map<string, string[]>();
  for (const key of keys) {
    const [channel, root] = key.split("|");
    if (!channel || !root) continue;
    byChannel.set(channel, [...(byChannel.get(channel) ?? []), root]);
  }
  if (!byChannel.size) return docs;
  const { data: chans } = await admin
    .from("slack_archive_channels")
    .select("slack_channel_id, label")
    .in("slack_channel_id", [...byChannel.keys()]);
  const label = new Map(((chans ?? []) as Array<{ slack_channel_id: string; label: string }>).map((c) => [c.slack_channel_id, c.label]));

  for (const [channel, roots] of byChannel) {
    const list = roots.map((r) => `"${r.replace(/"/g, "")}"`).join(",");
    const { data, error } = await admin
      .from("slack_archive_messages")
      .select("id, ts, thread_ts, author_name, message_text, posted_at")
      .eq("channel_id", channel)
      .or(`ts.in.(${list}),thread_ts.in.(${list})`)
      .limit(2000);
    if (error) throw new Error(`loading slack_archive_messages: ${error.message}`);
    const threads = new Map<string, Row[]>();
    for (const m of (data ?? []) as unknown as Row[]) {
      const root = String(m.thread_ts ?? m.ts);
      threads.set(root, [...(threads.get(root) ?? []), m]);
    }
    for (const [root, msgs] of threads) {
      msgs.sort((a, b) => Number(a.ts) - Number(b.ts));
      const said = msgs.filter((m) => String(m.message_text ?? "").trim());
      if (!said.length) continue;
      const first = msgs.find((m) => m.ts === root) ?? msgs[0];
      const where = label.get(channel) ?? channel;
      const text = said
        .map((m) => `${m.author_name ?? "Someone"} (${DAY.format(new Date(String(m.posted_at)))}): ${String(m.message_text).trim()}`)
        .join("\n\n");
      docs.set(`${channel}|${root}`, {
        entityId: first.id,
        title: `#${where}: ${short(String(said[0].message_text), 80)}`,
        href: `/portal/slack-archive/${encodeURIComponent(channel)}#msg-${root}`,
        sections: [{ text }],
      });
    }
  }
  return docs;
}

export interface IndexRun {
  processed: number;
  removed: number;
  embedded: number;
  errors: string[];
  // More waiting when the run stopped.
  more: boolean;
}

const BATCH = 25;

export async function processIndexQueue({
  deadlineMs = 20_000,
  maxItems = Infinity,
  admin = createAdminClient(),
  model = EMBEDDING_MODEL,
}: { deadlineMs?: number; maxItems?: number; admin?: SupabaseClient; model?: EmbeddingModel } = {}): Promise<IndexRun> {
  const stopAt = Date.now() + deadlineMs;
  const run: IndexRun = { processed: 0, removed: 0, embedded: 0, errors: [], more: false };

  while (Date.now() < stopAt && run.processed < maxItems) {
    const { data: queued, error } = await admin
      .from("search_index_queue")
      .select("kind, key, queued_at")
      .order("queued_at")
      .limit(Math.min(BATCH, maxItems - run.processed));
    if (error) {
      run.errors.push(`reading the queue: ${error.message}`);
      break;
    }
    const items = (queued ?? []) as Array<{ kind: Kind; key: string; queued_at: string }>;
    if (!items.length) return run;

    const byKind = new Map<Kind, typeof items>();
    for (const it of items) byKind.set(it.kind, [...(byKind.get(it.kind) ?? []), it]);

    for (const [kind, group] of byKind) {
      try {
        const keys = group.map((g) => g.key);
        const [docs, existing] = await Promise.all([
          loadDocs(admin, kind, keys),
          admin
            .from("search_chunks")
            .select("entity_key, chunk_index, content_hash")
            .eq("entity_type", kind)
            .in("entity_key", keys)
            .then(({ data, error: e }) => {
              if (e) throw new Error(`reading search_chunks: ${e.message}`);
              return (data ?? []) as Array<{ entity_key: string; chunk_index: number; content_hash: string }>;
            }),
        ]);
        const have = new Map(existing.map((c) => [`${c.entity_key}#${c.chunk_index}`, c.content_hash]));

        // Every chunk whose text changed, across the group, embedded together.
        const writes: Array<{ key: string; doc: Doc; index: number; content: string; hash: string }> = [];
        const counts = new Map<string, number>();
        for (const key of keys) {
          const doc = docs.get(key);
          const chunks = doc ? chunkSections(doc.title, doc.sections) : [];
          counts.set(key, chunks.length);
          chunks.forEach((content, index) => {
            const hash = hashText(`${doc!.href}\n${content}`);
            if (have.get(`${key}#${index}`) !== hash) writes.push({ key, doc: doc!, index, content, hash });
          });
        }
        if (writes.length) {
          const { embeddings } = await embedMany({ model, values: writes.map((w) => w.content), maxParallelCalls: 2 });
          if (embeddings.some((e) => e.length !== EMBEDDING_DIMS)) {
            throw new Error(`${typeof model === "string" ? model : "The embedding model"} returned vectors of length ${embeddings[0]?.length}, not ${EMBEDDING_DIMS}`);
          }
          const { error: upsertError } = await admin.from("search_chunks").upsert(
            writes.map((w, i) => ({
              entity_type: kind,
              entity_key: w.key,
              entity_id: w.doc.entityId,
              chunk_index: w.index,
              title: w.doc.title,
              href: w.doc.href,
              content: w.content,
              content_hash: w.hash,
              embedding: JSON.stringify(embeddings[i]),
              updated_at: new Date().toISOString(),
            })),
            { onConflict: "entity_type,entity_key,chunk_index" },
          );
          if (upsertError) throw new Error(`writing search_chunks: ${upsertError.message}`);
          run.embedded += writes.length;
        }

        for (const it of group) {
          const n = counts.get(it.key) ?? 0;
          // Chunks past the record's new length (all of them, if it's gone).
          const { error: delError } = await admin
            .from("search_chunks")
            .delete()
            .eq("entity_type", kind)
            .eq("entity_key", it.key)
            .gte("chunk_index", n);
          if (delError) throw new Error(`removing old chunks: ${delError.message}`);
          if (!n) run.removed++;
          // Done with it, unless it changed again while this ran.
          await admin.from("search_index_queue").delete().eq("kind", kind).eq("key", it.key).lte("queued_at", it.queued_at);
          run.processed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        run.errors.push(`${kind}: ${msg}`);
        console.error("[search-index]", kind, msg);
        // Leave this batch queued and stop: the same failure (a missing key,
        // the gateway down) would only repeat.
        run.more = true;
        return run;
      }
    }
  }
  run.more = true;
  return run;
}
