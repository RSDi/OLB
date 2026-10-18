// Strip anything dangerous from imported email HTML before we store or
// render it. Emails are untrusted (newsletters, forms, tracking pixels).
// Allowed tags match what the Archives thread view actually shows; images
// are dropped (pixels + remote content) — real files live as attachments.

const ALLOWED = new Set([
  "p", "div", "span", "br", "hr",
  "ul", "ol", "li",
  "a", "b", "strong", "i", "em", "u", "s", "blockquote", "pre", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
]);

const VOID = new Set(["br", "hr"]);
const DROP_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "noscript",
  "svg", "math", "link", "meta", "form", "template",
  "img", "video", "audio", "source", "picture", "canvas",
]);

const TAG_RE = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)\/?>/g;
const ATTR_RE = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  const lower = href.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return null;
  }
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("#")) {
    return href;
  }
  return null;
}

function attrsFor(tag: string, raw: string): string {
  if (tag !== "a") return "";
  ATTR_RE.lastIndex = 0;
  let href: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw))) {
    if (m[1].toLowerCase() === "href") {
      href = safeHref(m[2] ?? m[3] ?? m[4] ?? "");
    }
  }
  return href ? ` href="${href.replace(/"/g, "&quot;")}"` : "";
}

// Pure, no DOM. Safe to import from node --test.
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  let dropping = 0;
  TAG_RE.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html))) {
    if (dropping === 0) out += html.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0].startsWith("<!--")) continue;
    const tag = m[1].toLowerCase();
    const isClose = m[0].startsWith("</");
    const selfClose = m[0].endsWith("/>") || VOID.has(tag);
    if (DROP_CONTENT.has(tag)) {
      if (isClose) {
        if (dropping > 0) dropping -= 1;
      } else if (!selfClose) {
        dropping += 1;
      }
      continue;
    }
    if (dropping > 0) continue;
    if (!ALLOWED.has(tag)) continue;
    if (isClose) {
      if (!VOID.has(tag)) out += `</${tag}>`;
      continue;
    }
    const attrs = attrsFor(tag, m[2] ?? "");
    if (VOID.has(tag) || selfClose) {
      out += `<${tag}${attrs}>`;
    } else {
      out += `<${tag}${attrs}>`;
    }
  }
  if (dropping === 0) out += html.slice(last);
  return out.trim();
}
