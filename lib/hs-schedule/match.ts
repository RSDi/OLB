// Matching team names to External Contacts: "DMW", "So Metro", "Wichita Def"
// and "KC East" are how the HS planning spreadsheet writes the programs it
// schedules. Used by the spreadsheet import (lib/hs-schedule/import/) and by
// the "Add a team" box, so a name typed the way the coaches write it finds
// the program. Pure; safe to import from client components and node --test.
//
// A name is tried against each program's name, nickname and aliases in
// tiers, strictest first; the first tier with any hit decides, and a tier
// that hits two programs decides nothing ("Des Moines" could be the Warriors
// or the Defenders), so the name stays unmatched rather than guessed.
//
//   1. the same words ("christ prep" also matches "ChristPrep");
//   2. the words line up with the start of a name, each one the same word,
//      a prefix ("So Metro", "Wichita Def"), an abbreviation ("Mavs" for
//      Mavericks) or a one-letter typo ("Witchita"), skipping words in the
//      name ("St Louis Knights" for St Louis Blue Knights);
//   3. initials: "DMW" for Des Moines Warriors, "TCA" for Trinity Classical
//      Academy;
//   4. (loose only) one word anywhere in a name: "Classics" for Countryside
//      Classics;
//   5. (loose only) the program's city, when only one program is there:
//      "Plattsmouth".
//
// "Loose" is for a name that stands on its own (a list item, an opponent in
// a score); scanning running text for mentions uses tiers 1–3 only.

export interface TeamCandidate {
  id: string;
  name: string;
  nickname?: string | null;
  aliases?: string[] | null;
  city?: string | null;
}

export interface TeamMatch {
  id: string;
  // Which of the program's names matched, for the import preview.
  via: string;
}

// Lower case, accents off, "&" as "and", everything that isn't a letter or a
// digit a space.
export function normalizeTeamName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  const n = normalizeTeamName(s);
  return n ? n.split(" ") : [];
}

// Words too common to stand for a program by themselves.
// Our own city and the states around us are on that list too: "in Omaha"
// isn't the Omaha Roadrunners.
const WEAK_WORDS = new Set([
  "the", "of", "and", "at", "st", "saint", "north", "south", "east", "west", "new", "mid", "central",
  "great", "first", "life", "christian", "academy", "home", "school", "homeschool", "high", "hs", "jh", "jv",
  "var", "varsity", "team", "teams", "club", "basketball", "sports", "prep",
  "omaha", "nebraska", "iowa", "kansas", "missouri", "oklahoma", "texas", "minnesota", "arkansas",
  "college", "university", "church", "center", "complex", "fieldhouse", "gym", "ymca",
]);

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

// "mavs" in "mavericks": same first letter, its letters in order.
function isAbbreviation(short: string, long: string): boolean {
  if (short.length < 3 || short.length >= long.length || short[0] !== long[0]) return false;
  let j = 0;
  for (const ch of long) if (ch === short[j]) j++;
  return j === short.length;
}

// Does one word of the name typed stand for one word of a program's name?
function wordFits(q: string, n: string): boolean {
  if (q === n) return true;
  if (q.length >= 2 && n.startsWith(q)) return true;
  if (isAbbreviation(q, n)) return true;
  return q.length >= 5 && n.length >= 5 && editDistanceAtMostOne(q, n);
}

// Tier 2: the typed words line up with the start of the name, in order,
// allowing words of the name to be skipped after the first.
function wordsFit(q: string[], n: string[]): boolean {
  if (q.length === 0 || q.length > n.length) return false;
  if (!wordFits(q[0], n[0])) return false;
  let j = 1;
  for (let i = 1; i < q.length; i++) {
    while (j < n.length && !wordFits(q[i], n[j])) j++;
    if (j >= n.length) return false;
    j++;
  }
  return true;
}

function initials(n: string[]): string {
  return n.filter((w) => !["the", "of", "and", "at"].includes(w)).map((w) => w[0]).join("");
}

interface Entry {
  id: string;
  label: string; // the name as written, for `via`
  words: string[];
  compact: string;
  isName: boolean; // the program's own name (not a nickname/alias)
}

export interface TeamIndex {
  entries: Entry[];
  cities: Map<string, Set<string>>; // normalized city → program ids
}

export function buildTeamIndex(candidates: TeamCandidate[]): TeamIndex {
  const entries: Entry[] = [];
  const cities = new Map<string, Set<string>>();
  for (const c of candidates) {
    const labels: [string, boolean][] = [[c.name, true]];
    if (c.nickname?.trim()) labels.push([c.nickname, false]);
    for (const a of c.aliases ?? []) if (a?.trim()) labels.push([a, false]);
    for (const [label, isName] of labels) {
      const words = tokens(label);
      if (words.length === 0) continue;
      entries.push({ id: c.id, label: label.trim(), words, compact: words.join(""), isName });
    }
    const city = c.city ? normalizeTeamName(c.city) : "";
    if (city) {
      const set = cities.get(city) ?? new Set<string>();
      set.add(c.id);
      cities.set(city, set);
    }
  }
  return { entries, cities };
}

// One answer from a tier: a single program, or nothing (no hit, or hits on
// more than one program).
function decide(hits: Entry[]): TeamMatch | null | "ambiguous" {
  if (hits.length === 0) return null;
  const ids = new Set(hits.map((h) => h.id));
  if (ids.size > 1) return "ambiguous";
  const best = hits.find((h) => h.isName) ?? hits[0];
  return { id: best.id, via: best.label };
}

export function matchTeam(
  index: TeamIndex,
  raw: string,
  opts: { loose?: boolean } = {}
): TeamMatch | null {
  const q = tokens(raw);
  if (q.length === 0) return null;
  const compact = q.join("");
  const acronym = /^[A-Z]{2,6}$/.test(raw.trim());

  const tiers: (() => Entry[])[] = [
    // 1. Same words, or the same letters without the spaces.
    () => index.entries.filter((e) => e.compact === compact),
    // 2. Words that line up with the start of a name. One word on its own
    // has to be the name's first word (a one-letter typo allowed from five
    // letters): in capitals for a short one (CCA, UNO), else four letters or
    // more and not a common word ("Lincoln", "Smoky"; not "Mid", "First" or
    // "Classic").
    () =>
      index.entries.filter((e) => {
        if (q.length === 1) {
          const w = q[0];
          if (acronym) return e.words[0] === w;
          if (w.length < 4 || WEAK_WORDS.has(w)) return false;
          return e.words[0] === w || (w.length >= 5 && e.words[0].length >= 5 && editDistanceAtMostOne(w, e.words[0]));
        }
        return wordsFit(q, e.words);
      }),
    // 3. Initials.
    () => (acronym ? index.entries.filter((e) => e.words.length >= 2 && initials(e.words) === compact) : []),
  ];
  if (opts.loose && q.length === 1 && q[0].length >= 5 && !WEAK_WORDS.has(q[0])) {
    // 4. One word anywhere in a name.
    tiers.push(() => index.entries.filter((e) => e.words.slice(1).some((w) => w === q[0] || editDistanceAtMostOne(q[0], w))));
  }
  for (const tier of tiers) {
    const r = decide(tier());
    if (r === "ambiguous") return null;
    if (r) return r;
  }
  if (opts.loose) {
    // 5. The program's city, when it's the only program there.
    const ids = index.cities.get(q.join(" "));
    if (ids && ids.size === 1) {
      const id = [...ids][0];
      const e = index.entries.find((x) => x.id === id && x.isName);
      if (e) return { id, via: raw.trim() };
    }
  }
  return null;
}

// ─── Finding teams in running text ──────────────────────────────────────────

export interface Mention {
  // The words in the text that named it.
  text: string;
  match: TeamMatch | null;
  // Where it starts in the text, to keep the order and apply qualifiers.
  start: number;
}

// Every program named in a stretch of text: the longest run of words that
// matches (strict tiers), then on past it. A run never crosses the
// punctuation between list items (, ; / ( ) or a spaced dash). "Lincoln is
// open this weekend…" finds Lincoln; "Mid-America Homeschool Hoops Classic"
// finds nothing.
export function findMentions(index: TeamIndex, text: string, maxWords = 5): Mention[] {
  const words: { start: number; end: number; part: number }[] = [];
  const re = /[A-Za-z0-9][A-Za-z0-9'’]*|[,;/()]|\s[-–—]+\s|[-–—]{2,}|\.{2,}/g;
  let part = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (!/^[A-Za-z0-9]/.test(tok)) {
      part++;
      continue;
    }
    const trimmed = tok.replace(/['’]+$/g, "");
    if (trimmed) words.push({ start: m.index, end: m.index + trimmed.length, part });
  }
  const out: Mention[] = [];
  let i = 0;
  while (i < words.length) {
    let found: Mention | null = null;
    let used = 0;
    for (let n = Math.min(maxWords, words.length - i); n >= 1; n--) {
      if (words[i + n - 1].part !== words[i].part) continue;
      const phrase = text.slice(words[i].start, words[i + n - 1].end);
      const match = matchTeam(index, phrase);
      if (match) {
        found = { text: phrase, match, start: words[i].start };
        used = n;
        break;
      }
    }
    if (found) {
      out.push(found);
      i += used;
    } else i++;
  }
  return out;
}
