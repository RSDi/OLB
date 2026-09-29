// Parses an archived message's text the way Slack displays it, for
// SlackText (app/portal/slack-archive/_shared/SlackText.tsx).
//
// message_text is Slack's own `text` for the message: its mrkdwn, with the
// <...> tokens sync resolves swapped for names, [label](url) links, and
// backslash escapes in the names and labels it inserts (see
// resolveMentions in sync.ts). Pass it here after decodeSlackEntities.
//
// It used to go through the Markdown renderer, which reads Slack's markup
// differently: *bold* came out italic, single line breaks ran lines
// together, and lines starting with "#", "1." or four spaces turned into
// headings, lists and code. This follows Slack's rules instead:
//
// - Every line break is kept, and blank lines stay as blank lines.
// - *bold*, _italic_, ~strike~ and `code`, which open after a space or
//   punctuation and close before one, so snake_case and 2*3*4 stay as typed.
//   They can run across lines, since Slack's text for a bold run that spans
//   a line break marks the whole run once, but not past a blank line.
// - ```code blocks``` and "> " quotes. ">>>" quotes the rest of the message.
// - Lines starting with a bullet ("•", "◦", "-", "1." …) are list items,
//   which is how Slack writes out a list in a message's text.
// - @channel, @here and @everyone are marked so they can be highlighted.
//
// Kept free of imports so tests can load it straight from node --test.

export interface SlackRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
  broadcast?: boolean; // @channel, @here, @everyone
}

export interface SlackLine {
  runs: SlackRun[]; // empty for a blank line
  bullet?: string;  // the list marker ("•", "1."), taken out of runs
  indent: number;   // list nesting level, 0 at the left edge
}

export type SlackBlock =
  | { type: "text"; quote: boolean; lines: SlackLine[] }
  | { type: "code"; text: string };

const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
// The characters sync puts a backslash before (escapeMarkdown in sync.ts).
const ESCAPABLE = new Set(["_", "*", "`", "[", "]"]);
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const BARE_URL = /^https?:\/\/[^\s<>]+/i;
const BROADCAST = /(^|[^\p{L}\p{N}_])(@(?:channel|here|everyone))(?![\p{L}\p{N}_])/gu;

// A list item: optional indentation, then a bullet or a number. Letters and
// roman numerals count only when indented, which is how Slack numbers a
// nested ordered list; at the left edge "a. " is more likely prose.
const LIST_ITEM = /^([ \t]*)([•◦▪▫‣⁃●○■□–-]|\d{1,3}[.)])[ \t]+(?=\S)/;
const NESTED_LIST_ITEM = /^([ \t]+)([a-z]{1,4}[.)])[ \t]+(?=\S)/;

export function parseSlackText(text: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];
  for (const segment of splitCodeBlocks(text.replace(/\r\n?/g, "\n"))) {
    if (segment.code !== undefined) {
      blocks.push({ type: "code", text: segment.code });
      continue;
    }
    for (const group of splitQuotes(segment.text)) {
      const lines = parseLines(group.lines);
      if (lines.length > 0) blocks.push({ type: "text", quote: group.quote, lines });
    }
  }
  return blocks;
}

// ```…``` becomes a code block; a lone ``` stays as text. The line break
// right inside each fence, and the ones either side of the block, belong to
// the block rather than adding blank lines around it.
function splitCodeBlocks(text: string): { text: string; code?: string }[] {
  const segments: { text: string; code?: string }[] = [];
  let rest = text;
  for (;;) {
    const open = rest.indexOf("```");
    const close = open === -1 ? -1 : rest.indexOf("```", open + 3);
    if (close === -1) break;
    const code = rest.slice(open + 3, close).replace(/^\n/, "").replace(/\n$/, "");
    if (code.trim() === "") {
      // Nothing inside: leave the backticks as typed.
      segments.push({ text: rest.slice(0, close + 3) });
      rest = rest.slice(close + 3);
      continue;
    }
    segments.push({ text: rest.slice(0, open).replace(/\n$/, "") });
    segments.push({ text: "", code });
    rest = rest.slice(close + 3).replace(/^\n/, "");
  }
  segments.push({ text: rest });
  return mergeText(segments);
}

function mergeText(segments: { text: string; code?: string }[]): { text: string; code?: string }[] {
  const out: { text: string; code?: string }[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (s.code === undefined && last && last.code === undefined) last.text += s.text;
    else out.push({ ...s });
  }
  return out.filter((s) => s.code !== undefined || s.text !== "");
}

function splitQuotes(text: string): { quote: boolean; lines: string[] }[] {
  const groups: { quote: boolean; lines: string[] }[] = [];
  const lines = text.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  const push = (quote: boolean, line: string) => {
    const last = groups[groups.length - 1];
    if (last && last.quote === quote) last.lines.push(line);
    else groups.push({ quote, lines: [line] });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(">>>")) {
      push(true, line.slice(3).replace(/^ /, ""));
      for (const quoted of lines.slice(i + 1)) push(true, quoted);
      break;
    }
    if (line.startsWith(">")) push(true, line.slice(1).replace(/^ /, ""));
    else push(false, line);
  }
  return groups.filter((g) => g.lines.some((l) => l.trim() !== ""));
}

// Blank lines split the text into paragraphs; formatting doesn't carry
// across them. Each paragraph is parsed as a whole, then cut back into its
// lines.
function parseLines(lines: string[]): SlackLine[] {
  // A quote's own leading and trailing blank lines add nothing.
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;

  const out: SlackLine[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) out.push(...parseParagraph(paragraph));
    paragraph = [];
  };
  for (const line of lines.slice(start, end)) {
    if (line.trim() === "") {
      flush();
      out.push({ runs: [], indent: 0 });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return out;
}

function parseParagraph(lines: string[]): SlackLine[] {
  const items = lines.map((line) => line.match(NESTED_LIST_ITEM) ?? line.match(LIST_ITEM));
  const runLines = splitRunsIntoLines(parseInline(lines.join("\n")));
  return runLines.map((runs, i) => {
    const item = items[i];
    if (!item) return { runs, indent: 0 };
    const leading = item[1].replace(/\t/g, "    ").length;
    return {
      runs: dropLeadingChars(runs, item[0].length),
      bullet: item[2],
      indent: leading === 0 ? 0 : Math.max(1, Math.round(leading / 4)),
    };
  });
}

function splitRunsIntoLines(runs: SlackRun[]): SlackRun[][] {
  const lines: SlackRun[][] = [[]];
  for (const run of runs) {
    run.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== "") lines[lines.length - 1].push({ ...run, text: part });
    });
  }
  return lines;
}

// A list item's marker is plain text at the start of its line (no markup
// can be inside it), so it's the first `count` characters of the line.
function dropLeadingChars(runs: SlackRun[], count: number): SlackRun[] {
  const out: SlackRun[] = [];
  let left = count;
  for (const run of runs) {
    if (left >= run.text.length) {
      left -= run.text.length;
      continue;
    }
    out.push(left > 0 ? { ...run, text: run.text.slice(left) } : run);
    left = 0;
  }
  return out;
}

type Token =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "delim"; ch: "*" | "_" | "~"; canOpen: boolean; canClose: boolean; role?: "open" | "close" };

const STYLE_FOR = { "*": "bold", _: "italic", "~": "strike" } as const;

function parseInline(s: string): SlackRun[] {
  const tokens = tokenize(s);
  matchDelimiters(tokens);

  const runs: SlackRun[] = [];
  const depth = { bold: 0, italic: 0, strike: 0 };
  const push = (run: SlackRun) => {
    const styled: SlackRun = { ...run };
    if (depth.bold > 0) styled.bold = true;
    if (depth.italic > 0) styled.italic = true;
    if (depth.strike > 0) styled.strike = true;
    const last = runs[runs.length - 1];
    if (last && sameStyle(last, styled)) last.text += styled.text;
    else runs.push(styled);
  };
  for (const t of tokens) {
    if (t.kind === "delim") {
      if (t.role === "open") depth[STYLE_FOR[t.ch]]++;
      else if (t.role === "close") depth[STYLE_FOR[t.ch]]--;
      else push({ text: t.ch });
    } else if (t.kind === "code") {
      push({ text: t.text, code: true });
    } else if (t.kind === "link") {
      push({ text: t.text, href: t.href });
    } else {
      push({ text: t.text });
    }
  }
  return runs.flatMap(markBroadcasts);
}

function sameStyle(a: SlackRun, b: SlackRun): boolean {
  return (
    !a.code && !b.code && !a.href && !b.href && !a.broadcast && !b.broadcast &&
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.strike) === Boolean(b.strike)
  );
}

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let text = "";
  const flushText = () => {
    if (text) tokens.push({ kind: "text", text });
    text = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && ESCAPABLE.has(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = s.indexOf("`", i + 1);
      const inner = end === -1 ? "" : s.slice(i + 1, end);
      if (inner.trim() !== "" && !inner.includes("\n")) {
        flushText();
        tokens.push({ kind: "code", text: inner });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const link = readLink(s, i);
      if (link) {
        flushText();
        tokens.push({ kind: "link", text: link.label, href: link.href });
        i = link.end;
        continue;
      }
    }
    if ((ch === "h" || ch === "H") && (i === 0 || !WORD_CHAR.test(s[i - 1]))) {
      const url = readBareUrl(s.slice(i));
      if (url) {
        flushText();
        tokens.push({ kind: "link", text: url, href: url });
        i += url.length;
        continue;
      }
    }
    if (ch === "*" || ch === "_" || ch === "~") {
      const prev = i > 0 ? s[i - 1] : undefined;
      const next = i + 1 < s.length ? s[i + 1] : undefined;
      flushText();
      tokens.push({
        kind: "delim",
        ch,
        canOpen: next !== undefined && !SPACE.test(next) && (prev === undefined || !WORD_CHAR.test(prev)),
        canClose: prev !== undefined && !SPACE.test(prev) && (next === undefined || !WORD_CHAR.test(next)),
      });
      i++;
      continue;
    }
    text += ch;
    i++;
  }
  flushText();
  return tokens;
}

// [label](url), as sync writes a Slack link with a label. The label can't
// span lines and the URL must be a web or mail link; anything else is left
// as typed.
function readLink(s: string, start: number): { label: string; href: string; end: number } | null {
  let i = start + 1;
  let label = "";
  while (i < s.length && s[i] !== "]") {
    if (s[i] === "\n") return null;
    if (s[i] === "\\" && ESCAPABLE.has(s[i + 1])) {
      label += s[i + 1];
      i += 2;
    } else {
      label += s[i];
      i++;
    }
  }
  if (s[i] !== "]" || s[i + 1] !== "(" || label === "") return null;
  i += 2;
  const hrefStart = i;
  let parens = 0;
  while (i < s.length && !SPACE.test(s[i])) {
    if (s[i] === "(") parens++;
    else if (s[i] === ")") {
      if (parens === 0) break;
      parens--;
    }
    i++;
  }
  if (s[i] !== ")") return null;
  const href = s.slice(hrefStart, i);
  if (!SAFE_HREF.test(href)) return null;
  return { label, href, end: i + 1 };
}

// A bare link, minus punctuation that more likely ends the sentence (or a
// bold or italic run) than the URL, and a closing paren with no opening one
// inside the URL.
function readBareUrl(s: string): string | null {
  const match = s.match(BARE_URL);
  if (!match) return null;
  let url = match[0];
  for (;;) {
    const last = url[url.length - 1];
    if (/[.,;:!?'"*_~]/.test(last)) {
      url = url.slice(0, -1);
    } else if (last === ")" && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
      url = url.slice(0, -1);
    } else {
      break;
    }
  }
  return /^https?:\/\/[^/\s]/i.test(url) ? url : null;
}

// Pairs each closing mark with the nearest open one of the same kind. Marks
// opened in between and never closed are left as text, as are marks with
// nothing between them.
function matchDelimiters(tokens: Token[]): void {
  const open: number[] = [];
  tokens.forEach((t, i) => {
    if (t.kind !== "delim") return;
    if (t.canClose) {
      for (let k = open.length - 1; k >= 0; k--) {
        const opener = tokens[open[k]] as Extract<Token, { kind: "delim" }>;
        if (opener.ch !== t.ch) continue;
        if (open[k] === i - 1) break; // empty, like "**"
        opener.role = "open";
        t.role = "close";
        open.length = k;
        return;
      }
    }
    if (t.canOpen) open.push(i);
  });
}

function markBroadcasts(run: SlackRun): SlackRun[] {
  if (run.code || run.href || !run.text.includes("@")) return [run];
  const out: SlackRun[] = [];
  let last = 0;
  for (const m of run.text.matchAll(BROADCAST)) {
    const at = (m.index ?? 0) + m[1].length;
    if (at > last) out.push({ ...run, text: run.text.slice(last, at) });
    out.push({ ...run, text: m[2], broadcast: true });
    last = at + m[2].length;
  }
  if (last === 0) return [run];
  if (last < run.text.length) out.push({ ...run, text: run.text.slice(last) });
  return out;
}
