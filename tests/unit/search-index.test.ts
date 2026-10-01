// Search by meaning (migration 0113): cutting records into chunks
// (lib/portal-search/chunks.ts), turning chunk matches into results, and the
// indexer (lib/portal-search/indexer.ts) run against an in-memory stand-in for
// the database and a mock embedding model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockEmbeddingModelV3 } from "ai/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkSections, EMBEDDING_DIMS, groupChunkHits, hashText, markdownSections } from "../../lib/portal-search/chunks.ts";
import { processIndexQueue } from "../../lib/portal-search/indexer.ts";

test("markdownSections splits a playbook at its headings", () => {
  const sections = markdownSections("Intro line\n\n## Arrival\nBe there at 8.\n\n### Parking\nUse the north lot.\n## Empty\n\n");
  assert.deepEqual(sections, [
    { heading: undefined, text: "Intro line" },
    { heading: "Arrival", text: "Be there at 8." },
    { heading: "Parking", text: "Use the north lot." },
  ]);
});

test("chunkSections keeps chunks short, titled, and paragraphs whole where they fit", () => {
  const para = (n: number) => `Paragraph ${n}. ` + "word ".repeat(60).trim() + ".";
  const chunks = chunkSections("Game day", [
    { text: [1, 2, 3].map(para).join("\n\n") },
    { heading: "Cleanup", text: [4, 5, 6, 7, 8].map(para).join("\n\n") },
    { heading: "Huge", text: "x ".repeat(3000) },
  ], 800);
  assert.ok(chunks.length >= 5);
  for (const c of chunks) {
    assert.ok(c.length <= 900, `chunk of ${c.length}`);
    assert.ok(c.startsWith("Game day"), c.slice(0, 30));
  }
  assert.ok(chunks.some((c) => c.startsWith("Game day › Cleanup\nParagraph")));
  // Every paragraph that fits lands whole in exactly one chunk.
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) assert.equal(chunks.filter((c) => c.includes(para(n))).length, 1, `paragraph ${n}`);
  assert.deepEqual(chunkSections("Empty", [{ text: "  " }]), []);
});

test("hashText is stable and sensitive", () => {
  assert.equal(hashText("a"), hashText("a"));
  assert.notEqual(hashText("a"), hashText("b"));
});

test("groupChunkHits gives one result per record, best first, with its matched text", () => {
  const row = (entity_id: string, chunk_index: number, score: number, content: string) => ({
    entity_type: "playbook", entity_key: entity_id, entity_id, chunk_index, title: `PB ${entity_id}`, href: `/portal/docs/${entity_id}`, content, score,
  });
  const { hits, texts } = groupChunkHits([
    row("a", 2, 0.02, "PB a\nlater part"),
    row("b", 0, 0.03, "PB b\nthe best match"),
    row("a", 0, 0.025, "PB a\nfirst part"),
    row("a", 1, 0.01, "PB a\nweak"),
  ]);
  assert.deepEqual(hits.map((h) => [h.id, h.rank]), [["b", 0.03], ["a", 0.025]]);
  assert.equal(hits[1].subtitle, "first part");
  // The record's two best chunks, in reading order.
  assert.equal(texts.get("playbook:a"), "PB a\nfirst part\n\nPB a\nlater part");
});

// ── The indexer against an in-memory database ──────────────────────────────

type Row = Record<string, unknown>;

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: null }> {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "delete" | "upsert" = "select";
  private rows: Row[] = [];
  private conflict: string[] = [];
  private max = Infinity;
  private sortBy?: string;
  private db: Record<string, Row[]>;
  private table: string;
  constructor(db: Record<string, Row[]>, table: string) {
    this.db = db;
    this.table = table;
  }
  select() { return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  gte(c: string, v: number | string) { this.filters.push((r) => (r[c] as number | string) >= v); return this; }
  lte(c: string, v: number | string) { this.filters.push((r) => (r[c] as number | string) <= v); return this; }
  or(expr: string) {
    const parts = [...expr.matchAll(/(\w+)\.in\.\(([^)]*)\)/g)].map((m) => ({ col: m[1], vals: m[2].split(",").map((v) => v.replace(/"/g, "")) }));
    this.filters.push((r) => parts.some((p) => p.vals.includes(String(r[p.col]))));
    return this;
  }
  order(c: string) { this.sortBy = c; return this; }
  limit(n: number) { this.max = n; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(rows: Row[], opts: { onConflict: string }) { this.op = "upsert"; this.rows = rows; this.conflict = opts.onConflict.split(","); return this; }
  then<A, B>(ok?: ((v: { data: Row[] | null; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
  private run() {
    const t = (this.db[this.table] ??= []);
    if (this.op === "upsert") {
      for (const row of this.rows) {
        const i = t.findIndex((r) => this.conflict.every((c) => r[c] === row[c]));
        if (i >= 0) t[i] = { ...t[i], ...row };
        else t.push({ ...row });
      }
      return { data: null, error: null };
    }
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.op === "delete") {
      this.db[this.table] = t.filter((r) => !match(r));
      return { data: null, error: null };
    }
    let out = t.filter(match);
    if (this.sortBy) out = [...out].sort((a, b) => String(a[this.sortBy!]).localeCompare(String(b[this.sortBy!])));
    return { data: out.slice(0, this.max), error: null };
  }
}

function fakeDb(db: Record<string, Row[]>) {
  return { from: (table: string) => new FakeQuery(db, table) } as unknown as SupabaseClient;
}

function embedder() {
  const embedded: string[] = [];
  const model = new MockEmbeddingModelV3({
    doEmbed: async ({ values }) => {
      embedded.push(...values);
      return { embeddings: values.map(() => Array.from({ length: EMBEDDING_DIMS }, () => 0.01)), warnings: [] };
    },
  });
  return { model, embedded };
}

const PB = "00000000-0000-0000-0000-000000000001";
const GONE = "00000000-0000-0000-0000-000000000002";

test("the indexer embeds new text once, skips unchanged text, and removes what's gone", async () => {
  const db: Record<string, Row[]> = {
    playbooks: [{ id: PB, title: "Uniforms", excerpt: "Ordering and care", body_md: "## Ordering\nOrder jerseys by Oct 1.\n\n## Care\nWash cold.", deleted_at: null }],
    slack_archive_messages: [
      { id: "m1", channel_id: "C1", ts: "100.1", thread_ts: null, author_name: "Coach", message_text: "Jersey sizes due Friday", posted_at: "2026-09-01T15:00:00Z" },
      { id: "m2", channel_id: "C1", ts: "100.2", thread_ts: "100.1", author_name: "Pat", message_text: "Thanks!", posted_at: "2026-09-01T16:00:00Z" },
    ],
    slack_archive_channels: [{ slack_channel_id: "C1", label: "12u-parents" }],
    ticket_comments: [],
    search_chunks: [{ entity_type: "playbook", entity_key: GONE, entity_id: GONE, chunk_index: 0, content_hash: "x" }],
    search_index_queue: [
      { kind: "playbook", key: PB, queued_at: "2026-10-01T00:00:01Z" },
      { kind: "playbook", key: GONE, queued_at: "2026-10-01T00:00:02Z" },
      { kind: "slack", key: "C1|100.1", queued_at: "2026-10-01T00:00:03Z" },
    ],
  };
  const admin = fakeDb(db);
  const first = embedder();
  const run = await processIndexQueue({ admin, model: first.model });
  assert.deepEqual(run.errors, []);
  assert.equal(run.processed, 3);
  assert.equal(run.removed, 1);
  assert.equal(run.more, false);
  assert.equal(db.search_index_queue.length, 0);
  const chunks = db.search_chunks;
  assert.ok(!chunks.some((c) => c.entity_key === GONE), "the deleted playbook's chunks are removed");
  const pb = chunks.filter((c) => c.entity_key === PB);
  assert.equal(pb.length, 1);
  assert.match(String(pb[0].content), /^Uniforms\nOrdering and care[\s\S]*Order jerseys by Oct 1\.[\s\S]*Wash cold\./);
  const thread = chunks.find((c) => c.entity_type === "slack");
  assert.equal(thread?.entity_id, "m1", "a thread follows its first message's visibility");
  assert.equal(thread?.href, "/portal/slack-archive/C1#msg-100.1");
  assert.match(String(thread?.title), /^#12u-parents: Jersey sizes due Friday/);
  assert.match(String(thread?.content), /Coach \(Sep 1, 2026\): Jersey sizes due Friday\n\nPat \(Sep 1, 2026\): Thanks!/);
  assert.equal(first.embedded.length, 2);
  assert.equal(JSON.parse(String(pb[0].embedding)).length, EMBEDDING_DIMS);

  // Queued again with nothing changed: nothing re-embedded.
  db.search_index_queue.push({ kind: "playbook", key: PB, queued_at: "2026-10-01T01:00:00Z" });
  const second = embedder();
  const again = await processIndexQueue({ admin, model: second.model });
  assert.equal(again.processed, 1);
  assert.equal(second.embedded.length, 0);

  // An edit re-embeds only that record.
  db.playbooks[0].body_md = "## Ordering\nOrder jerseys by Oct 15.";
  db.search_index_queue.push({ kind: "playbook", key: PB, queued_at: "2026-10-01T02:00:00Z" });
  const third = embedder();
  await processIndexQueue({ admin, model: third.model });
  assert.equal(third.embedded.length, 1);
  assert.match(third.embedded[0], /Oct 15/);
  assert.equal(db.search_chunks.filter((c) => c.entity_key === PB).length, 1);
});

test("a failed embedding call leaves the queue for next time", async () => {
  const db: Record<string, Row[]> = {
    playbooks: [{ id: PB, title: "Uniforms", excerpt: null, body_md: "Order jerseys.", deleted_at: null }],
    search_chunks: [],
    search_index_queue: [{ kind: "playbook", key: PB, queued_at: "2026-10-01T00:00:01Z" }],
  };
  const model = new MockEmbeddingModelV3({ doEmbed: async () => { throw new Error("gateway down"); } });
  const run = await processIndexQueue({ admin: fakeDb(db), model });
  assert.equal(run.processed, 0);
  assert.equal(run.more, true);
  assert.match(run.errors[0], /gateway down/);
  assert.equal(db.search_index_queue.length, 1);
});

test("vectors of the wrong length are refused, not stored", async () => {
  const db: Record<string, Row[]> = {
    playbooks: [{ id: PB, title: "Uniforms", excerpt: null, body_md: "Order jerseys.", deleted_at: null }],
    search_chunks: [],
    search_index_queue: [{ kind: "playbook", key: PB, queued_at: "2026-10-01T00:00:01Z" }],
  };
  const model = new MockEmbeddingModelV3({ doEmbed: async ({ values }) => ({ embeddings: values.map(() => [0.1, 0.2]), warnings: [] }) });
  const run = await processIndexQueue({ admin: fakeDb(db), model });
  assert.match(run.errors[0], /length 2, not 1024/);
  assert.equal(db.search_chunks.length, 0);
});
