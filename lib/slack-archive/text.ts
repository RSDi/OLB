// Slack HTML-escapes &, <, and > in message text on the wire (`&amp;`,
// `&lt;`, `&gt;`) so its own <...> control tokens stay unambiguous. Sync
// resolves those tokens away (lib/slack-archive/sync.ts) but stores the
// entity escapes as-is, so decoding happens once, at render — which also
// covers every message archived before this existed. `&amp;` goes last so
// a literal "&lt;" typed by a user (wire form "&amp;lt;") round-trips back
// to "&lt;" instead of over-decoding to "<".
export function decodeSlackEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const SNIPPET_LEAD = 24; // characters kept before a match that isn't near the start
const WORD_CHAR = /[\p{L}\p{N}]/u;

// First place `needle` starts a word in `haystack` (both lowercase), or -1.
function indexOfWordStart(haystack: string, needle: string): number {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(haystack[i - 1])) return i;
  }
  return -1;
}

// One line of plain text from an archived message, for a search result:
// entities decoded, the markdown links sync writes reduced to their labels,
// the backslash escapes it adds to names and labels removed, bold/strike/code
// marks dropped, whitespace collapsed. If the first matching word is well
// into the message, the snippet starts a few words before it ("…" in front)
// so the match shows in a one-line result.
export function messageSnippet(text: string, query: string, maxLength = 140): string {
  const plain = decodeSlackEntities(text)
    .replace(/\[([^\]]*)\]\([^)\s]*\)/g, "$1")
    .replace(/\\([_*`[\]])/g, "$1")
    .replace(/[*~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Words match the start of a word, with stemming (migration 0093), so the
  // whole word typed may not appear ("coaches" also finds "coaching"): fall
  // back to its first four letters.
  const lower = plain.toLowerCase();
  let at = -1;
  for (const term of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (term.length < 2) continue;
    const i = [term, term.slice(0, 4)].map((needle) => indexOfWordStart(lower, needle)).find((idx) => idx !== -1);
    if (i !== undefined && (at === -1 || i < at)) at = i;
  }

  let start = 0;
  if (at > SNIPPET_LEAD * 2) {
    const space = plain.indexOf(" ", at - SNIPPET_LEAD);
    start = space !== -1 && space < at ? space + 1 : at;
  }
  let snippet = plain.slice(start);
  if (snippet.length > maxLength) {
    const cut = snippet.lastIndexOf(" ", maxLength);
    snippet = snippet.slice(0, cut > maxLength / 2 ? cut : maxLength) + "…";
  }
  return start > 0 ? `…${snippet}` : snippet;
}
