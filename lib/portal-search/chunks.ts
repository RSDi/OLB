// Search by meaning, the pure parts: cutting a record into chunks for the
// index (search_chunks, migration 0113), and turning search_hybrid's chunk
// matches back into one result per record. No network or database code, so
// the unit tests can run it directly.

import { createHash } from "node:crypto";
import type { EntityType, SearchHit } from "../search/useGlobalSearch";

// The embedding model, through the AI Gateway. Its vectors must have the
// length search_chunks.embedding is declared with.
export const EMBEDDING_MODEL = "voyage/voyage-4";
export const EMBEDDING_DIMS = 1024;
export const RERANK_MODEL = "voyage/rerank-2.5";

// About 450 tokens: a few paragraphs, enough to carry one idea.
export const CHUNK_CHARS = 1800;

export type Section = { heading?: string; text: string };

// A playbook's markdown, split at its headings.
export function markdownSections(md: string): Section[] {
  const sections: Section[] = [];
  let heading: string | undefined;
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ heading, text });
    lines = [];
  };
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (m) {
      flush();
      heading = m[1];
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

// A paragraph too long for one chunk, cut at sentence ends where it can be.
function splitLong(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cutAt = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"), window.lastIndexOf("? "), window.lastIndexOf("! "));
    const at = cutAt > max * 0.4 ? cutAt + 1 : window.lastIndexOf(" ") > max * 0.4 ? window.lastIndexOf(" ") : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// A record's text as chunks of at most `max` characters. Paragraphs are kept
// whole where they fit, and every chunk starts with the record's title (and
// the heading it falls under) so it still makes sense on its own.
export function chunkSections(title: string, sections: Section[], max = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let body = "";
  let bodyHeading: string | undefined;
  const head = (heading?: string) => (heading ? `${title} › ${heading}` : title);
  const flush = () => {
    if (body.trim()) chunks.push(`${head(bodyHeading)}\n${body.trim()}`);
    body = "";
  };
  for (const section of sections) {
    const room = max - head(section.heading).length - 1;
    const paragraphs = section.text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .flatMap((p) => (p.length > room ? splitLong(p, room) : [p]));
    for (const p of paragraphs) {
      const sameHeading = bodyHeading === section.heading;
      const label = !sameHeading && body ? `${section.heading ? `${section.heading}\n` : ""}` : "";
      if (body && (body.length + label.length + p.length + 2 > room)) flush();
      if (!body) {
        bodyHeading = section.heading;
        body = p;
      } else {
        body += `\n\n${label}${p}`;
      }
    }
  }
  flush();
  return chunks;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export interface ChunkRow {
  entity_type: string;
  entity_key: string;
  entity_id: string;
  chunk_index: number;
  title: string;
  href: string;
  content: string;
  score: number;
}

// search_hybrid's matches, one per record (its best-scoring chunk), best
// first, as search hits; plus each record's matched text (up to its two
// best chunks), for the AI to read.
export function groupChunkHits(rows: ChunkRow[]): { hits: SearchHit[]; texts: Map<string, string> } {
  const byRecord = new Map<string, { best: ChunkRow; chunks: ChunkRow[] }>();
  for (const row of rows) {
    const key = `${row.entity_type}:${row.entity_id}`;
    const cur = byRecord.get(key);
    if (!cur) byRecord.set(key, { best: row, chunks: [row] });
    else {
      cur.chunks.push(row);
      if (row.score > cur.best.score) cur.best = row;
    }
  }
  const hits: SearchHit[] = [];
  const texts = new Map<string, string>();
  for (const [key, { best, chunks }] of [...byRecord].sort((a, b) => b[1].best.score - a[1].best.score)) {
    const top = [...chunks].sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.chunk_index - b.chunk_index);
    const snippet = best.content.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim();
    hits.push({
      entity_type: best.entity_type as EntityType,
      id: best.entity_id,
      title: best.title,
      subtitle: snippet.length > 140 ? `${snippet.slice(0, 137)}…` : snippet || null,
      href: best.href,
      rank: best.score,
    });
    texts.set(key, top.map((c) => c.content).join("\n\n"));
  }
  return { hits, texts };
}
