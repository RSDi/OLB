// The portal's /portal/search page, as pure functions: turn a question into
// the words worth searching for, merge what each word finds into one ranked
// list, and number the top records as sources for the AI answer. No network
// or framework code here, so the unit tests can run it directly.
//
// The portal's search functions (search_global, archive_search_global) match
// a query as one phrase or as all of its words, so a question like "who
// fixes the gym lights?" finds nothing as typed. The page searches each
// content word on its own instead, and ranks records by how many of the
// words found them.

import type { EntityType, SearchHit } from "../search/useGlobalSearch";

const STOPWORDS = new Set(
  ("a an and are as at be but by can could do does for from get go had has have how i if in into is it its " +
    "me my of on or our so than that the their them then there these they this to up us was we were " +
    "what when where which who whom whose why will with would you your about any all also am been being " +
    "did just more most much no not only other out over same should some such too very tell show find " +
    "know need want please anyone someone something anything thing things there's what's who's where's " +
    "lightning olb omaha")
    .split(" "),
);

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/’/g, "'")
    .split(/[^a-z0-9@.'-]+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean);
}

// "lights" → "light", "fixes" → "fix", "painting" → "paint": the search functions match a
// word anywhere inside the text, so the shorter form finds both.
function root(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(?:ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const MAX_TERMS = 6;

// The words to search for, most specific first: no stop words, nothing
// shorter than three letters unless it has a digit ("5k", "10u"), each once.
export function searchTerms(query: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words(query)) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 3 && !/\d/.test(w)) continue;
    const r = root(w);
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  // Longer words tend to be the specific ones; keep the question's order
  // among equals so the list is stable.
  return out
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.length - a.w.length || a.i - b.i)
    .slice(0, MAX_TERMS)
    .map((x) => x.w);
}

// One search's hits, and what was searched for: the whole question, or one
// of its words.
export type TermHits = { term: string; whole: boolean; hits: SearchHit[] };

export type RankedHit = SearchHit & { matched: string[] };

// Every record any search found, once, best first. A record found by more of
// the question's words ranks higher; the whole question matching word for
// word counts extra; the search functions' own rank breaks ties.
export function mergeHits(lists: TermHits[], limit = 20): RankedHit[] {
  const byKey = new Map<string, { hit: SearchHit; matched: Set<string>; whole: boolean; rank: number }>();
  for (const { term, whole, hits } of lists) {
    for (const hit of hits) {
      const key = `${hit.entity_type}:${hit.id}`;
      const cur = byKey.get(key) ?? { hit, matched: new Set<string>(), whole: false, rank: 0 };
      if (whole) cur.whole = true;
      else cur.matched.add(term);
      cur.rank = Math.max(cur.rank, Number(hit.rank) || 0);
      byKey.set(key, cur);
    }
  }
  return [...byKey.values()]
    .map((r) => ({ ...r, score: r.matched.size + (r.whole ? 2 : 0) + Math.min(r.rank, 1) }))
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title))
    .slice(0, limit)
    .map((r) => ({ ...r.hit, matched: [...r.matched] }));
}

// What the page shows for each kind of record, and what the AI is told it is.
export const TYPE_LABEL: Record<EntityType, string> = {
  member: "Member",
  contact: "External contact",
  maintenance: "Task",
  pm_task: "PM task",
  pm_template: "PM template",
  asset: "Asset",
  event: "Event",
  playbook: "Playbook",
  slack: "Slack message",
};

// The filter buttons over the results.
export const TYPE_GROUP: Record<EntityType, string> = {
  member: "Members",
  contact: "External contacts",
  maintenance: "Tasks",
  pm_task: "PM tasks",
  pm_template: "PM templates",
  asset: "Assets",
  event: "Events",
  playbook: "Playbooks",
  slack: "Slack",
};

export type Source = { n: number; entity_type: EntityType; title: string; href: string };

// A record's full text for the AI, keyed by `${entity_type}:${id}`.
export type RecordText = Map<string, string>;

const PER_RECORD = 3000;

// The records the AI answer is written from, numbered so it can cite them as
// [1], [2]… Each is its type, title and full text (or, if its text couldn't
// be loaded, what the search result shows), cut to a length and a total.
export function answerContext(
  hits: RankedHit[],
  texts: RecordText,
  { max = 12, budget = 30_000 } = {},
): { sources: Source[]; context: string } {
  const sources: Source[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const hit of hits.slice(0, max)) {
    const n = sources.length + 1;
    const body = (texts.get(`${hit.entity_type}:${hit.id}`) ?? [hit.title, hit.subtitle].filter(Boolean).join("\n")).trim();
    const text = body.length > PER_RECORD ? `${body.slice(0, PER_RECORD)} …` : body;
    const block = `[${n}] ${TYPE_LABEL[hit.entity_type]}: ${oneLine(hit.title)}\n${text}\n`;
    if (sources.length && used + block.length > budget) break;
    sources.push({ n, entity_type: hit.entity_type, title: oneLine(hit.title), href: hit.href });
    blocks.push(block);
    used += block.length;
  }
  return { sources, context: blocks.join("\n") };
}

function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}
