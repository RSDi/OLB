// Reading teams out of the spreadsheet's Event cells. They're written for
// people, not parsers:
//
//   "Missouri River Shootout (OLB / Lincoln / KC Metro / KC East / Wichita
//    Warriors / BluePrint) - Potentials....DMW, RR, Veritas, Smoky…"
//   "Var -- First Baptist (Plattsmouth), JV --  Pro Vision Select"
//   "TCA -- JV (Friday), DM Warriors (Saturday)"
//   "Sioux City, Hardin County (JV)"
//
// so this goes by a few habits of the sheet: list items sit between , / ;
// ( ) and dashes; "Potentials", "Possibly" and "Maybe" start the teams that
// are on the fence; "Var --", "(JV)", "JH vs" and "- JV/Varsity" say which
// of our teams a team plays. A team that isn't in External Contacts is kept
// by name only when it's written like a name in a list ("BluePrint", "OKC
// Storm"); in running text only known programs are picked out. The import
// preview shows what was found for every weekend, and the event's full text
// is kept on the weekend, so nothing is lost when this guesses wrong.
// Pure; node --test runs it.

import { findMentions, matchTeam, normalizeTeamName, type TeamIndex } from "../hs-schedule/match.ts";
import { clean } from "./grid.ts";

export interface LevelRef {
  label: string;
  hidden: boolean;
}

export interface ParsedTeam {
  // As the sheet wrote it: "DMW", "Wichita Def".
  text: string;
  // The program it matched (a TeamCandidate id), or null.
  matchId: string | null;
  // Which of our teams play it (level labels); null = every team we bring.
  levels: string[] | null;
  tentative: boolean;
}

export interface ParsedScore {
  opponent: string;
  ours: number;
  theirs: number;
}

// Names that mean us.
const SELF = new Set(["olb", "lightning", "omaha lightning", "omaha lightning basketball"]);

export function isSelf(name: string): boolean {
  return SELF.has(normalizeTeamName(name));
}

// Words that make a list item something other than a team's name.
const NOT_A_NAME = new Set([
  "tourney", "tournament", "invitational", "classic", "shootout", "tri", "quad", "senior", "sr", "night",
  "scrimmage", "alumni", "practice", "game", "games", "local", "nationals", "national", "regionals",
  "regional", "districts", "district", "open", "weekend", "off", "canceled", "cancelled", "due", "weather",
  "fri", "friday", "sat", "saturday", "sun", "sunday", "thu", "thur", "thurs", "thursday", "am", "pm",
  "etc", "start", "max", "allowed", "prior", "possibly", "maybe", "potentials", "potential", "all",
  "program", "only", "pre", "season", "hoops", "homeschool", "thanksgiving", "christmas", "planned",
  "tbd", "times", "time", "prep",
]);

const JOINERS = new Set(["and", "of", "the", "at"]);

const MARKER = /\b(potentials?|possibl[ey]|maybe)\b/i;

// ─── Qualifiers: which of our teams ─────────────────────────────────────────

type Qual = "all" | string[];

function qualWord(word: string, levels: LevelRef[]): Qual | null {
  const w = word.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const pick = (re: RegExp) => {
    const hits = levels.filter((l) => re.test(l.label.trim()));
    const shown = hits.filter((l) => !l.hidden);
    return (shown.length ? shown : hits).map((l) => l.label);
  };
  if (["v", "var", "varsity", "varisty", "vars"].includes(w)) {
    const hits = pick(/^(v|var|varsity|18u)$/i);
    return hits.length ? hits : levels.length ? [levels[0].label] : null;
  }
  if (w === "jv") return nonEmpty(pick(/^(jv\s*\d*|16u)$/i));
  if (w === "jh") return nonEmpty(pick(/^14u/i));
  if (w === "gs") return nonEmpty(pick(/^(12u|10u)/i));
  if (w === "all program" || w === "all programs" || w === "all") return "all";
  const exact = levels.filter((l) => l.label.trim().toLowerCase() === w);
  return exact.length ? exact.map((l) => l.label) : null;
}

function nonEmpty(a: string[]): string[] | null {
  return a.length ? a : null;
}

// "Var" → V; "Var, JV" is two chunks, merged by the caller.
function chunkQual(text: string, levels: LevelRef[]): Qual | null {
  const t = clean(text);
  if (!t) return null;
  return qualWord(t, levels);
}

function mergeQuals(a: Qual | null, b: Qual | null): Qual | null {
  if (!a) return b;
  if (!b) return a;
  if (a === "all" || b === "all") return "all";
  return [...new Set([...a, ...b])];
}

// ─── Chunks ─────────────────────────────────────────────────────────────────

interface Chunk {
  text: string;
  before: string; // the separator before it ("(", ",", "--", "-", "...", "vs", ";", ")" or "")
  after: string;
  depth: number; // inside how many parentheses
  start: number; // its position, for "on the fence from here on"
}

function prep(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/-{2,}/g, " -- ")
    .replace(/\.{2,}/g, " ... ")
    .replace(/\s-(?=[^\s-])/g, " - ")
    .replace(/(?<=[^\s-])-\s/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

const SEP = /(\(|\)|,|\/|;|\?|\s--\s|\s-\s|\s\.\.\.\s|\s+vs\.?\s+)/i;

function chunks(text: string): Chunk[] {
  const parts = text.split(SEP);
  const out: Chunk[] = [];
  let depth = 0;
  let pos = 0;
  let before = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) {
      const sep = p.trim().toLowerCase().replace(/\.$/, "") || p;
      if (out.length && out[out.length - 1].after === "") out[out.length - 1].after = sep;
      if (sep === "(") depth++;
      if (sep === ")") depth = Math.max(0, depth - 1);
      before = sep;
    } else if (clean(p)) {
      out.push({ text: clean(p), before, after: "", depth, start: pos });
      before = "";
    }
    pos += p.length;
  }
  return out;
}

const DASH = new Set(["--", "-"]);

// A list item written like a team's name: a few capitalized words (or an
// acronym), no digits, nothing from NOT_A_NAME.
function looksLikeName(text: string): boolean {
  if (/\d/.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length > 5) return false;
  for (const w of words) {
    const bare = w.replace(/[^A-Za-z'’.-]/g, "");
    if (!bare) return false;
    if (NOT_A_NAME.has(bare.toLowerCase().replace(/[^a-z]/g, ""))) return false;
    if (JOINERS.has(bare.toLowerCase())) continue;
    if (!/^[A-Z]/.test(bare)) return false;
  }
  return true;
}

// ─── Teams ──────────────────────────────────────────────────────────────────

// "Possibly in Sebetha, KS": a state after a town isn't a team.
const STATES = new Set(
  ("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY " +
    "NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" ")
);

export function parseEventTeams(text: string, index: TeamIndex, levels: LevelRef[]): ParsedTeam[] {
  const src = prep(text);
  const marker = src.search(MARKER);
  const list = chunks(src);

  type Found = { text: string; matchId: string | null; qual: Qual | null; tentative: boolean };
  const found: Found[] = [];
  let pending: Found[] = []; // teams in this clause with no qualifier yet
  let current: { qual: Qual; depth: number } | null = null;
  let justSet = false;

  const add = (t: string, matchId: string | null, start: number) => {
    if (isSelf(t)) return;
    const f: Found = {
      text: t,
      matchId,
      qual: current?.qual ?? null,
      tentative: marker >= 0 && start >= marker,
    };
    found.push(f);
    if (!current) pending.push(f);
  };

  let i = 0;
  while (i < list.length) {
    const c = list[i];
    // A qualifier set inside ( ) ends with them; a clause ends at ";".
    if (current && c.depth < current.depth) current = null;
    if (c.before === ";") {
      current = null;
      pending = [];
    }

    // A run of qualifiers: "Var", "Var, JV", "JV/Varsity", "(Var, JV, JH, GS)".
    const q = chunkQual(c.text, levels);
    if (q) {
      let j = i;
      let qual: Qual = q;
      while (j + 1 < list.length && (list[j].after === "," || list[j].after === "/")) {
        const nq = chunkQual(list[j + 1].text, levels);
        if (!nq) break;
        qual = mergeQuals(qual, nq)!;
        j++;
      }
      const first = list[i];
      const last = list[j];
      if (DASH.has(last.after) || last.after === "vs") {
        // "Var -- First Baptist", "JH vs OCA": it covers what follows.
        current = { qual, depth: last.depth };
        justSet = true;
      } else if (DASH.has(first.before) || (first.before === "(" && last.after === ")")) {
        // "TCA -- JV", "Hastings Tourney - JV/Varsity", "Sioux City, Hardin
        // County (JV)": it covers the teams just before it.
        for (const p of pending) p.qual = qual;
        pending = [];
        justSet = false;
      }
      i = j + 1;
      continue;
    }

    // "…) -- NEK, Manhattan": a dash that doesn't follow a qualifier starts over.
    if (DASH.has(c.before) && !justSet && current && current.depth >= c.depth) current = null;
    justSet = false;
    i++;

    if (isSelf(c.text) || STATES.has(c.text)) continue;
    if (looksLikeName(c.text)) {
      const whole = matchTeam(index, c.text, { loose: true });
      if (whole) {
        add(c.text, whole.id, c.start);
        continue;
      }
      // "Smoky Valley Eagles": a known program covering most of the words.
      // ("OKC Storm" isn't OKC Knights: one word of two isn't most.)
      const words = c.text.split(/\s+/).length;
      const m = findMentions(index, c.text).find((x) => x.start === 0);
      if (m?.match && m.text.split(/\s+/).length * 2 > words) {
        add(c.text, m.match.id, c.start);
        continue;
      }
      add(c.text, null, c.start);
      continue;
    }
    // Running text: only programs we know.
    for (const m of findMentions(index, c.text)) {
      if (m.match) add(m.text, m.match.id, c.start + m.start);
    }
  }

  // One entry per program: the first mention wins, with every team of ours
  // any of its mentions named.
  const allLabels = levels.map((l) => l.label);
  const out: ParsedTeam[] = [];
  const byKey = new Map<string, ParsedTeam>();
  for (const f of found) {
    const key = f.matchId ?? `name:${normalizeTeamName(f.text)}`;
    const lv = !f.qual || f.qual === "all" ? null : f.qual;
    const prev = byKey.get(key);
    if (prev) {
      prev.levels = prev.levels === null || lv === null ? null : [...new Set([...prev.levels, ...lv])];
      continue;
    }
    const entry: ParsedTeam = { text: f.text, matchId: f.matchId, levels: lv, tentative: f.tentative };
    byKey.set(key, entry);
    out.push(entry);
  }
  for (const t of out) {
    if (t.levels && allLabels.length && allLabels.every((l) => t.levels!.includes(l))) t.levels = null;
  }
  return out;
}

// ─── Scores ─────────────────────────────────────────────────────────────────

// "OLB 71 vs So Metro 40 / No Metro 63 vs OLB 45 / Surise 72 - OLB 26" →
// one result per game, from our side.
export function parseScores(text: string): ParsedScore[] {
  const out: ParsedScore[] = [];
  for (const part of text.split("/").map(clean).filter(Boolean)) {
    const m = part.match(/^(.+?)\s+(\d{1,3})\s*(?:vs\.?|v\.?|-|–|—)\s*(.+?)\s+(\d{1,3})\s*$/i);
    if (!m) continue;
    const [, a, x, b, y] = m;
    if (isSelf(a) && !isSelf(b)) out.push({ opponent: clean(b), ours: Number(x), theirs: Number(y) });
    else if (isSelf(b) && !isSelf(a)) out.push({ opponent: clean(a), ours: Number(y), theirs: Number(x) });
  }
  return out;
}

// ─── The event's name ───────────────────────────────────────────────────────

// Short enough for the grid: the whole text when it's short, else what comes
// before the first "(" or dash. The full text goes in the weekend's details.
export function eventTitle(text: string): { event: string; details: string | null } {
  const t = clean(text);
  if (t.length <= 80) return { event: t, details: null };
  const cut = t.search(/\s*(\(|\s-{1,}\s|-{2,})/);
  const head = cut >= 3 ? t.slice(0, cut).trim() : t.slice(0, 77).trim() + "…";
  return { event: head, details: t };
}
