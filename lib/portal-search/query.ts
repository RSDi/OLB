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

// Every kind of record an answer can cite: what the portal's search finds,
// plus a team and a weekend on the high school schedule, which the
// assistant's own lookups return.
export type SourceType = EntityType | "team" | "schedule";

// What the page shows for each kind of record, and what the AI is told it is.
export const TYPE_LABEL: Record<SourceType, string> = {
  member: "Member",
  contact: "External contact",
  maintenance: "Task",
  pm_task: "PM task",
  pm_template: "PM template",
  asset: "Asset",
  event: "Event",
  playbook: "Playbook",
  slack: "Slack message",
  team: "Team",
  schedule: "HS schedule",
};

// The filter buttons over the results.
export const TYPE_GROUP: Record<SourceType, string> = {
  member: "Members",
  contact: "External contacts",
  maintenance: "Tasks",
  pm_task: "PM tasks",
  pm_template: "PM templates",
  asset: "Assets",
  event: "Events",
  playbook: "Playbooks",
  slack: "Slack",
  team: "Teams",
  schedule: "HS schedule",
};

export type Source = { n: number; entity_type: SourceType; title: string; href: string };

// A record's full text, keyed by `${entity_type}:${id}`.
export type RecordText = Map<string, string>;

export type SourceRecord = {
  entity_type: SourceType;
  id: string;
  title: string;
  href: string;
  text: string;
};

const MAX_TEXT = 8000;

type Entry = Source & { id: string; text: string };

// The records one answer can cite, numbered in the order the assistant's
// lookups first return them, so it can cite them as [1], [2]… A record found
// twice keeps its first number. Text is cut to a length, so opening a long
// playbook can't crowd out the rest of the answer.
export class SourceRegistry {
  #byKey = new Map<string, Entry>();
  #list: Entry[] = [];

  add(rec: SourceRecord): number {
    const key = `${rec.entity_type}:${rec.id}`;
    const have = this.#byKey.get(key);
    if (have) {
      if (rec.text.length > have.text.length) have.text = cut(rec.text, MAX_TEXT);
      return have.n;
    }
    const entry: Entry = {
      n: this.#list.length + 1,
      entity_type: rec.entity_type,
      id: rec.id,
      title: oneLine(rec.title),
      href: rec.href,
      text: cut(rec.text, MAX_TEXT),
    };
    this.#byKey.set(key, entry);
    this.#list.push(entry);
    return entry.n;
  }

  get(n: number): Entry | undefined {
    return this.#list[n - 1];
  }

  sources(): Source[] {
    return this.#list.map(({ n, entity_type, title, href }) => ({ n, entity_type, title, href }));
  }

  // The records an answer cites, in the order it first cites them.
  cited(answer: string): Array<{ n: number; entity_type: SourceType; id: string; title: string }> {
    const seen = new Set<number>();
    const out: Array<{ n: number; entity_type: SourceType; id: string; title: string }> = [];
    for (const m of answer.matchAll(/\[(\d{1,3})\]/g)) {
      const n = Number(m[1]);
      const s = this.#list[n - 1];
      if (s && !seen.has(n)) {
        seen.add(n);
        out.push({ n: s.n, entity_type: s.entity_type, id: s.id, title: s.title });
      }
    }
    return out;
  }
}

export function cut(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)} …` : t;
}

export function oneLine(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat;
}

// Earlier answers go back to the assistant as plain text for follow-ups.
// Their [n] citations pointed at that turn's own sources, so they're dropped
// rather than confused with this turn's numbering.
export function stripCitations(text: string): string {
  return text.replace(/\s*\[\d{1,3}\]/g, "").trim();
}

const LABEL_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const labelDay = (ymd: unknown) =>
  typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? LABEL_DAY.format(new Date(`${ymd}T12:00:00Z`)) : "?";

// The progress line the page shows while the assistant uses a tool.
export function stepLabel(toolName: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "search_portal":
      return `Searching for “${String(i.query ?? "").slice(0, 60)}”`;
    case "get_record":
      return `Reading source ${i.source}`;
    case "schedule":
      return `Checking the calendar, ${labelDay(i.from)} – ${labelDay(i.to)}${i.team ? ` (${String(i.team).slice(0, 30)})` : ""}`;
    case "team":
      return `Looking up the ${String(i.name ?? "").slice(0, 40)} team`;
    case "tasks":
      return {
        mine: "Checking your tasks",
        open: "Checking open tasks",
        overdue: "Checking overdue tasks",
        due_soon: "Checking tasks due soon",
      }[String(i.filter)] ?? "Checking tasks";
    default:
      return "Looking something up";
  }
}
