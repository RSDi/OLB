// How the public site turns page text (markdown) into its pages' HTML.
// Safe to import from client components.

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const isBlank = (n: HastNode) => n.type === "text" && !(n.value ?? "").trim();

// A paragraph that's only bold words, like "**-God-**" on Philosophy or
// "**Registration fee: $375**" on Programs: a subheading.
function isSubheading(n: HastNode): boolean {
  if (n.type !== "element" || n.tagName !== "p") return false;
  const kids = (n.children ?? []).filter((c) => !isBlank(c));
  return kids.length === 1 && kids[0].type === "element" && kids[0].tagName === "strong";
}

// The original pages put an empty paragraph above each subheading for
// breathing room. This rehype plugin does the same for page text, so a bold
// line on its own gets that space without anyone typing it: above a
// top-level subheading that follows something other than another
// subheading (a run of them, like a list of names, stays together).
export function rehypeSubheadingSpace() {
  return (tree: HastNode) => {
    const kids = tree.children ?? [];
    const out: HastNode[] = [];
    let prev: HastNode | null = null;
    for (const node of kids) {
      if (isBlank(node)) {
        out.push(node);
        continue;
      }
      if (prev && isSubheading(node) && !isSubheading(prev)) {
        out.push({ type: "element", tagName: "p", properties: {}, children: [] });
      }
      out.push(node);
      prev = node;
    }
    tree.children = out;
  };
}

const BLOCK = new Set(["p", "ul", "ol", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "table"]);

// The original pages' lists always hold paragraphs (<li><p>…</p></li>), which
// is what spaces their items. Markdown only does that when the items are
// separated by blank lines, so this rehype plugin wraps a list item's loose
// words in a paragraph either way: lists look the same however they're typed.
export function rehypeListParagraphs() {
  const visit = (node: HastNode) => {
    for (const child of node.children ?? []) visit(child);
    if (node.type !== "element" || node.tagName !== "li") return;
    const out: HastNode[] = [];
    let run: HastNode[] = [];
    const flush = () => {
      if (run.some((n) => !isBlank(n))) {
        // Trim the newlines markdown leaves around the words.
        while (run.length && isBlank(run[0])) run.shift();
        while (run.length && isBlank(run[run.length - 1])) run.pop();
        out.push({ type: "element", tagName: "p", properties: {}, children: run });
      } else out.push(...run);
      run = [];
    };
    for (const child of node.children ?? []) {
      if (child.type === "element" && BLOCK.has(child.tagName ?? "")) {
        flush();
        out.push(child);
      } else run.push(child);
    }
    flush();
    node.children = out;
  };
  return (tree: HastNode) => visit(tree);
}
