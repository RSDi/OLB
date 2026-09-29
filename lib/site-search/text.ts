// The /search page's search engine, as pure functions: pull the readable text
// out of a rendered public page, cut it into passages under their headings,
// and rank those passages against a question. No network or framework code
// here, so the unit tests can run it directly.

export type Passage = { heading: string; text: string };

export type SitePage = {
  path: string;
  title: string;
  description: string;
  passages: Passage[];
};

// A snippet split into plain and highlighted runs, so the page can bold the
// words that matched without rendering HTML from the server.
export type SnippetPart = { text: string; hit: boolean };

export type SearchResult = {
  path: string;
  title: string;
  description: string;
  heading: string;
  snippet: SnippetPart[];
  // The page link, plus a text fragment that scrolls to the matched passage
  // in browsers that support it (the others just open the page).
  href: string;
  score: number;
};

// ── HTML → passages ────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—",
  hellip: "…", copy: "©", reg: "®", trade: "™", bull: "•", middot: "·",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// Tags that end a line of text when read aloud.
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|br|hr|tr|td|th|table|section|article|header|footer|nav|aside|blockquote|details|summary|dd|dt|dl|figure|figcaption|label|option|h[1-6])\b[^>]*>/gi;

function htmlToLines(html: string): string[] {
  return decodeEntities(html.replace(BLOCK_TAG, "\n").replace(/<[^>]*>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? decodeEntities(m[2] ?? m[3] ?? "") : "";
}

// Longest passage, in characters, before a section is split in two.
const PASSAGE_CHARS = 700;

function splitLines(lines: string[]): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > PASSAGE_CHARS) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

// Reads a public-site page as a visitor would: only what's inside <main>
// (the header menu and footer repeat on every page), without scripts, styles
// or icons, split into passages at each heading. A heading with nothing under
// it before the next one (a big title over a subtitle) joins the next
// passage's text so its words still count.
export function extractPage(path: string, html: string): SitePage {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] ?? "")
    .replace(/\s+[—–-]\s+Omaha Lightning Basketball\s*$/, "")
    .trim() || path;
  const metaDesc = html.match(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i);
  const description = metaDesc ? attr(metaDesc[0], "content") : "";

  const start = html.search(/<main\b/i);
  const end = html.search(/<\/main>/i);
  let body = start >= 0 && end > start ? html.slice(start, end) : html;
  body = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|svg|noscript|template|select|textarea|iframe)\b[\s\S]*?<\/\1>/gi, "");

  const passages: Passage[] = [];
  let heading = title;
  let pending: string[] = [];
  const flush = (chunk: string) => {
    const lines = htmlToLines(chunk);
    if (lines.length === 0) return;
    for (const text of splitLines([...pending, ...lines])) passages.push({ heading, text });
    pending = [];
  };

  const headingRe = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let last = 0;
  for (let m = headingRe.exec(body); m; m = headingRe.exec(body)) {
    const before = body.slice(last, m.index);
    const hadText = htmlToLines(before).length > 0;
    flush(before);
    const text = htmlToLines(m[1]).join(" ");
    if (text) {
      // The previous heading had no text of its own: keep it as context.
      if (!hadText && heading !== title) pending.push(heading);
      heading = text;
    }
    last = m.index + m[0].length;
  }
  const tail = body.slice(last);
  if (htmlToLines(tail).length) flush(tail);
  // A last heading with nothing under it still counts as a passage.
  else if (heading !== title) pending.push(heading);
  if (pending.length) passages.push({ heading, text: pending.join("\n") });

  return { path, title, description, passages };
}

// ── Tokens ─────────────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  ("a an and are as at be but by can do does for from get go had has have how i if in into is it its " +
    "me my of on or our so than that the their them then there these they this to up us was we were " +
    "what when where which who whom why will with would you your about any all also am been being " +
    "did just more most much no not only other out over same should some such too very")
    .split(" "),
);

// A light English stemmer: enough that "practices" finds "practice" and
// "registering" finds "register", without the surprises of a full one.
export function stem(word: string): string {
  let w = word.replace(/['’]s$/, "");
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && /(?:ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  // "practic" (from "practicing") and "practice" should meet.
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9$']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

export function tokens(text: string): string[] {
  return words(text).filter((w) => !STOPWORDS.has(w)).map(stem);
}

// ── Ranking ────────────────────────────────────────────────────────────────

type Scored = { page: SitePage; passage: Passage; score: number };

// Every passage on the site scored against the question, best first. A
// tf-idf sum over the question's words, weighted up when the words appear in
// the passage's heading or page title, when every word is present, and when
// the question appears word for word.
export function scorePassages(pages: SitePage[], query: string): Scored[] {
  const qTerms = [...new Set(tokens(query))];
  if (qTerms.length === 0) return [];
  const all = pages.flatMap((page) =>
    page.passages.map((passage) => ({
      page,
      passage,
      body: tokens(passage.text),
      head: new Set(tokens(`${passage.heading} ${page.title}`)),
    })),
  );
  const df = new Map<string, number>();
  for (const p of all) for (const t of new Set([...p.body, ...p.head])) df.set(t, (df.get(t) ?? 0) + 1);

  const phrase = words(query).join(" ");
  const scored: Scored[] = [];
  for (const p of all) {
    let score = 0;
    let matched = 0;
    for (const t of qTerms) {
      const tf = p.body.filter((b) => b === t).length;
      const inHead = p.head.has(t);
      if (!tf && !inHead) continue;
      matched++;
      const idf = Math.log(1 + all.length / (df.get(t) ?? 1));
      score += idf * ((tf ? 1 + Math.log(tf) : 0) + (inHead ? 1.5 : 0));
    }
    if (!matched) continue;
    score *= (matched / qTerms.length) ** 2;
    if (phrase.includes(" ") && words(`${p.passage.heading} ${p.passage.text}`).join(" ").includes(phrase)) {
      score *= 1.5;
    }
    scored.push({ page: p.page, passage: p.passage, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

const SNIPPET_CHARS = 260;

// A window of the passage around its first matching word, with the matching
// words marked.
export function snippet(text: string, query: string): SnippetPart[] {
  const qTerms = new Set(tokens(query));
  const flat = text.replace(/\s*\n\s*/g, " · ");
  const re = /[A-Za-z0-9$’']+/g;
  const hits: Array<[number, number]> = [];
  for (let m = re.exec(flat); m; m = re.exec(flat)) {
    const w = words(m[0])[0];
    if (w && !STOPWORDS.has(w) && qTerms.has(stem(w))) hits.push([m.index, m.index + m[0].length]);
  }
  let from = 0;
  if (flat.length > SNIPPET_CHARS && hits.length) {
    from = Math.max(0, Math.min(hits[0][0] - 60, flat.length - SNIPPET_CHARS));
    const space = flat.lastIndexOf(" ", from);
    from = from === 0 ? 0 : space >= 0 ? space + 1 : from;
  }
  let to = Math.min(flat.length, from + SNIPPET_CHARS);
  if (to < flat.length) {
    const space = flat.lastIndexOf(" ", to);
    if (space > from) to = space;
  }
  const parts: SnippetPart[] = [];
  const push = (t: string, hit: boolean) => { if (t) parts.push({ text: t, hit }); };
  if (from > 0) push("… ", false);
  let at = from;
  for (const [s, e] of hits) {
    if (e <= from || s >= to) continue;
    push(flat.slice(at, s), false);
    push(flat.slice(s, e), true);
    at = e;
  }
  push(flat.slice(at, to), false);
  if (to < flat.length) push(" …", false);
  return parts;
}

// A link to the page that, where the browser supports text fragments, scrolls
// to and highlights the opening words of the passage's first matching line.
export function passageHref(path: string, passage: Passage, query = ""): string {
  const qTerms = new Set(tokens(query));
  const lines = passage.text.split("\n");
  const line = lines.find((l) => tokens(l).some((t) => qTerms.has(t))) ?? lines[0];
  const opening = line.split(" ").slice(0, 6).join(" ");
  return opening ? `${path}#:~:text=${encodeURIComponent(opening).replace(/-/g, "%2D")}` : path;
}

const sameWords = (a: string, b: string) => words(a).join(" ") === words(b).join(" ");

// The best passage from each page, ranked: a page's score is its best
// passage plus a little for each other passage that also matched.
export function search(pages: SitePage[], query: string, limit = 8): SearchResult[] {
  const byPage = new Map<string, Scored[]>();
  for (const s of scorePassages(pages, query)) {
    const list = byPage.get(s.page.path) ?? [];
    list.push(s);
    byPage.set(s.page.path, list);
  }
  return [...byPage.values()]
    .map((list) => {
      const [best, ...rest] = list;
      return {
        path: best.page.path,
        title: best.page.title,
        description: best.page.description,
        heading: sameWords(best.passage.heading, best.page.title) ? "" : best.passage.heading,
        snippet: snippet(best.passage.text, query),
        href: passageHref(best.page.path, best.passage, query),
        score: best.score + 0.25 * rest.reduce((sum, s) => sum + s.score, 0),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type Source = { n: number; path: string; title: string };

// What the AI answer is written from: the site's pages, most relevant first,
// numbered so the answer can cite them as [1], [2]… Pages that didn't match
// still go in after the ones that did (the site is small, and a question
// phrased in other words than the page uses should still find its answer),
// up to a character budget.
export function answerContext(
  pages: SitePage[],
  query: string,
  budget = 40_000,
): { sources: Source[]; context: string } {
  const rank = new Map<string, number>();
  for (const s of scorePassages(pages, query)) rank.set(s.page.path, (rank.get(s.page.path) ?? 0) + s.score);
  const ordered = [...pages].sort((a, b) => (rank.get(b.path) ?? 0) - (rank.get(a.path) ?? 0));

  const sources: Source[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const page of ordered) {
    const n = sources.length + 1;
    let block = `[${n}] ${page.title} (${page.path})\n`;
    let lastHeading = "";
    for (const p of page.passages) {
      if (p.heading !== lastHeading && p.heading !== page.title) block += `## ${p.heading}\n`;
      lastHeading = p.heading;
      block += `${p.text}\n`;
    }
    if (used + block.length > budget) {
      if (sources.length) break;
      block = block.slice(0, budget);
    }
    sources.push({ n, path: page.path, title: page.title });
    blocks.push(block);
    used += block.length;
  }
  return { sources, context: blocks.join("\n") };
}
