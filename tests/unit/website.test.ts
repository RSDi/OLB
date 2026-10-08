// Settings → Website: the public site's menu (lib/website/menu.ts) and the
// checks on page text and pictures (lib/website/content.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanMenu,
  DEFAULT_MENU,
  isFolder,
  menuFromRows,
  menuToInput,
  normalizeMenuHref,
  type MenuRow,
} from "../../lib/website/menu.ts";
import {
  cleanImageValue,
  cleanText,
  keepLineBreaks,
  parseImageValue,
  siteImageUrlPrefix,
} from "../../lib/website/content.ts";

test("menu links: site pages and web addresses are tidied, anything else refused", () => {
  assert.equal(normalizeMenuHref("/coaches"), "/coaches");
  assert.equal(normalizeMenuHref(" coaches "), "/coaches");
  assert.equal(normalizeMenuHref("/programs#u14"), "/programs#u14");
  assert.equal(normalizeMenuHref("https://example.com/a?b=1"), "https://example.com/a?b=1");
  assert.equal(normalizeMenuHref("www.example.com"), "https://www.example.com/");
  assert.equal(normalizeMenuHref(""), null);
  assert.equal(normalizeMenuHref("javascript:alert(1)"), null);
  assert.equal(normalizeMenuHref("mailto:a@b.com"), null);
  assert.equal(normalizeMenuHref("//evil.com"), null);
  assert.equal(normalizeMenuHref("/two words"), null);
  assert.equal(normalizeMenuHref("https://localhost"), null);
});

test("no saved rows means the built-in menu", () => {
  assert.equal(menuFromRows([]), null);
});

test("saved rows become the menu, in order, with folders and new-tab links", () => {
  const rows: MenuRow[] = [
    { id: "b", parent_id: null, label: "Coaches", href: "/coaches", sort_order: 20 },
    { id: "a", parent_id: null, label: "About", href: null, sort_order: 10 },
    { id: "a2", parent_id: "a", label: "History", href: "/history", sort_order: 20 },
    { id: "a1", parent_id: "a", label: "Philosophy", href: "/philosophy", sort_order: 10 },
    { id: "c", parent_id: null, label: "Handbook", href: "https://drive.google.com/x", sort_order: 30 },
    // A folder with no links left is dropped.
    { id: "d", parent_id: null, label: "Empty", href: null, sort_order: 40 },
  ];
  assert.deepEqual(menuFromRows(rows), [
    {
      label: "About",
      children: [
        { label: "Philosophy", href: "/philosophy" },
        { label: "History", href: "/history" },
      ],
    },
    { label: "Coaches", href: "/coaches" },
    { label: "Handbook", href: "https://drive.google.com/x", external: true },
  ]);
});

test("the built-in menu passes its own checks", () => {
  const c = cleanMenu(menuToInput(DEFAULT_MENU));
  assert.ok("menu" in c, "error" in c ? c.error : "");
  assert.equal(c.menu.length, DEFAULT_MENU.length);
  assert.equal(c.menu.filter((m) => m.children.length).length, DEFAULT_MENU.filter(isFolder).length);
});

test("cleanMenu trims, and explains what's wrong", () => {
  const ok = cleanMenu([{ label: "  Coaches ", href: "coaches", children: [] }]);
  assert.deepEqual(ok, { menu: [{ label: "Coaches", href: "/coaches", children: [] }] });

  assert.match((cleanMenu([]) as { error: string }).error, /at least one/);
  assert.match((cleanMenu([{ label: " ", href: "/a", children: [] }]) as { error: string }).error, /Item 1 needs a label/);
  assert.match((cleanMenu([{ label: "Bad", href: "javascript:x", children: [] }]) as { error: string }).error, /"Bad" needs a site page/);
  assert.match(
    (cleanMenu([{ label: "About", href: "", children: [{ label: "", href: "/x" }] }]) as { error: string }).error,
    /Link 1 under "About" needs a label/,
  );
  const twoFolders = cleanMenu([
    { label: "About", href: "", children: [{ label: "A", href: "/a" }] },
    { label: "about", href: "", children: [{ label: "B", href: "/b" }] },
  ]);
  assert.match((twoFolders as { error: string }).error, /Two folders/);
});

test("a folder ignores its own link", () => {
  const c = cleanMenu([{ label: "About", href: "/ignored", children: [{ label: "A", href: "/a" }] }]);
  assert.deepEqual(c, { menu: [{ label: "About", href: "", children: [{ label: "A", href: "/a" }] }] });
});

test("text: trimmed, line endings normalized, empty and too-long refused", () => {
  assert.deepEqual(cleanText("  Hi\r\nthere  "), { value: "Hi\nthere" });
  assert.ok("error" in cleanText("   "));
  assert.ok("error" in cleanText("abcdef", 5));
});

test("single line breaks show as line breaks; paragraphs stay paragraphs", () => {
  assert.equal(keepLineBreaks("a\nb\n\nc"), "a  \nb\n\nc");
});

test("pictures: only this project's site-images bucket, with a size", () => {
  const prefix = siteImageUrlPrefix("https://abc.supabase.co/");
  assert.equal(prefix, "https://abc.supabase.co/storage/v1/object/public/site-images/");
  const good = { url: `${prefix}x.jpg`, width: 800, height: 600, alt: " A team " };
  assert.deepEqual(cleanImageValue(good, prefix), { value: { ...good, alt: "A team" } });
  assert.ok("error" in cleanImageValue({ ...good, url: "https://evil.com/x.jpg" }, prefix));
  assert.ok("error" in cleanImageValue({ ...good, url: `${prefix}../other/x.jpg` }, prefix));
  assert.ok("error" in cleanImageValue({ ...good, width: 0 }, prefix));
  assert.ok("error" in cleanImageValue(good, null));
});

test("a saved picture parses back, and junk reads as unset", () => {
  assert.deepEqual(parseImageValue(JSON.stringify({ url: "u", width: 10.4, height: 5, alt: "x" })), {
    url: "u",
    width: 10,
    height: 5,
    alt: "x",
  });
  assert.equal(parseImageValue("not json"), null);
  assert.equal(parseImageValue(JSON.stringify({ url: "u" })), null);
  assert.equal(parseImageValue(null), null);
});

test("every editable spot has a unique key the database accepts", () => {
  // slots.ts imports the site's pictures, which plain Node can't load, so
  // read the keys from its source.
  const src = readFileSync(join(import.meta.dirname, "../../lib/website/slots.ts"), "utf8");
  const keys = [...src.matchAll(/^\s+key: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(keys.length >= 10);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z0-9_.-]+$/);
});

// ─── Part 2: buttons, lists, new pages, drafts and preview ──────────────────

import { readdirSync } from "node:fs";
import {
  cleanImageRef,
  cleanLink,
  cleanList,
  isValidSlug,
  normalizeSlug,
  parseLink,
  parseList,
  RESERVED_SLUGS,
  type ListField,
} from "../../lib/website/content.ts";
import { menuFromInput } from "../../lib/website/menu.ts";
import { rehypeListParagraphs, rehypeSubheadingSpace } from "../../lib/website/markdown.ts";
import { previewPath } from "../../lib/website/preview-path.ts";

const PREFIX = "https://abc.supabase.co/storage/v1/object/public/site-images/";

test("buttons: words required, links checked; a bad saved one reads as unset", () => {
  assert.deepEqual(cleanLink({ label: " Donate ", href: "contact" }), { value: { label: "Donate", href: "/contact" } });
  assert.ok("error" in cleanLink({ label: "", href: "/contact" }));
  assert.ok("error" in cleanLink({ label: "Go", href: "javascript:alert(1)" }));
  assert.deepEqual(parseLink(JSON.stringify({ label: "Go", href: "/x" })), { label: "Go", href: "/x" });
  assert.equal(parseLink(JSON.stringify({ label: "Go", href: "javascript:alert(1)" })), null);
  assert.equal(parseLink("junk"), null);
});

test("pictures in lists: the site's own, or uploads to this project's bucket", () => {
  assert.deepEqual(cleanImageRef({ builtin: "coach-a", alt: " A " }, PREFIX, ["coach-a"]), { value: { builtin: "coach-a", alt: "A" } });
  assert.ok("error" in cleanImageRef({ builtin: "nope", alt: "" }, PREFIX, ["coach-a"]));
  assert.ok("error" in cleanImageRef({ url: "https://evil.com/a.jpg", width: 1, height: 1, alt: "" }, PREFIX, []));
});

const COACH_FIELDS: ListField[] = [
  { name: "name", label: "Name", type: "text", required: true, max: 80 },
  { name: "photo", label: "Photo", type: "image", required: true },
  { name: "link", label: "Web address", type: "url" },
  { name: "bio", label: "Bio", type: "markdown" },
];
const rules = (fields: ListField[], max = 10) => ({ fields, itemName: "coach", max, prefix: PREFIX, builtinIds: ["coach-a"] });

test("lists: tidied, and each problem names the item", () => {
  const ok = cleanList(
    [{ name: " Sam ", photo: { builtin: "coach-a", alt: "" }, link: "www.example.com", bio: " Hi\r\nthere " }],
    rules(COACH_FIELDS),
  );
  assert.deepEqual(ok, {
    value: [{ name: "Sam", photo: { builtin: "coach-a", alt: "" }, link: "https://www.example.com/", bio: "Hi\nthere" }],
  });
  assert.deepEqual(cleanList([], rules(COACH_FIELDS)), { value: [] });
  assert.match((cleanList([{ name: "", photo: null }], rules(COACH_FIELDS)) as { error: string }).error, /Name on Coach 1 is empty/);
  assert.match((cleanList([{ name: "Sam", photo: null }], rules(COACH_FIELDS)) as { error: string }).error, /"Sam" needs a picture/);
  assert.match(
    (cleanList([{ name: "Sam", photo: { builtin: "coach-a", alt: "" }, link: "ftp://x" }], rules(COACH_FIELDS)) as { error: string }).error,
    /Web address on "Sam"/,
  );
  assert.match((cleanList([{ name: "A\nB", photo: { builtin: "coach-a", alt: "" } }], rules(COACH_FIELDS)) as { error: string }).error, /single line/);
  assert.match((cleanList([{}, {}], rules(COACH_FIELDS, 1)) as { error: string }).error, /up to 1/);
});

const PAGE_FIELDS: ListField[] = [
  { name: "title", label: "Title", type: "text", required: true },
  { name: "slug", label: "Address", type: "slug", required: true },
  { name: "body", label: "Page text", type: "markdown", required: true },
];

test("new pages: addresses are tidied, unique, and can't take the site's own", () => {
  assert.equal(normalizeSlug("  Fall Camp 2026! "), "fall-camp-2026");
  assert.equal(normalizeSlug("/Coach's Corner"), "coachs-corner");
  assert.ok(isValidSlug("fall-camp"));
  assert.ok(!isValidSlug("coaches"));
  assert.ok(!isValidSlug("portal"));
  const page = (slug: string) => ({ title: "T", slug, body: "B" });
  assert.deepEqual(cleanList([page("Fall Camp")], rules(PAGE_FIELDS)), { value: [page("fall-camp")] });
  assert.match((cleanList([page("coaches")], rules(PAGE_FIELDS)) as { error: string }).error, /already has a page at \/coaches/);
  assert.match((cleanList([page("a"), page("A")], rules(PAGE_FIELDS)) as { error: string }).error, /Two pages have the address \/a/);
  assert.match((cleanList([page("!!!")], rules(PAGE_FIELDS)) as { error: string }).error, /needs letters or numbers/);
});

test("every top-level route and old redirect is a reserved page address", () => {
  const app = join(import.meta.dirname, "../../app");
  const dirs = new Set<string>();
  // Folders with a page or route handler somewhere inside (app/components
  // is code, not a route).
  const hasRoute = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((e) =>
      e.isDirectory() ? hasRoute(join(dir, e.name)) : /^(page|route)\.tsx?$/.test(e.name),
    );
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith("_") || e.name.startsWith("[")) continue;
      if (e.name.startsWith("(")) walk(join(dir, e.name));
      else if (hasRoute(join(dir, e.name))) dirs.add(e.name);
    }
  };
  walk(app);
  const config = readFileSync(join(import.meta.dirname, "../../next.config.ts"), "utf8");
  for (const m of config.matchAll(/source: "\/([a-z0-9-]+)"/g)) dirs.add(m[1]);
  for (const d of dirs) assert.ok(RESERVED_SLUGS.includes(d), `/${d} should be in RESERVED_SLUGS`);
});

test("a saved list that isn't a list reads as unset", () => {
  assert.equal(parseList("junk"), null);
  assert.equal(parseList(JSON.stringify({ a: 1 })), null);
  assert.deepEqual(parseList(JSON.stringify([{ a: "1" }, 3, null])), [{ a: "1" }]);
});

test("a draft menu shows as saved, with bad links dropped", () => {
  assert.deepEqual(
    menuFromInput([
      { label: "About", href: "", children: [{ label: "History", href: "/history" }, { label: "Bad", href: "javascript:x" }] },
      { label: "Coaches", href: "/coaches", children: [] },
      { label: "Handbook", href: "https://drive.google.com/x", children: [] },
      { label: "Broken", href: "javascript:x", children: [] },
    ]),
    [
      { label: "About", children: [{ label: "History", href: "/history" }] },
      { label: "Coaches", href: "/coaches" },
      { label: "Handbook", href: "https://drive.google.com/x", external: true },
    ],
  );
  assert.equal(menuFromInput([]), null);
});

type Node = { type: string; tagName?: string; value?: string; properties?: object; children?: Node[] };
const p = (...children: Node[]): Node => ({ type: "element", tagName: "p", properties: {}, children });
const strong = (t: string): Node => ({ type: "element", tagName: "strong", properties: {}, children: [{ type: "text", value: t }] });
const txt = (t: string): Node => ({ type: "text", value: t });
const tags = (tree: Node) => (tree.children ?? []).filter((n) => n.type === "element").map((n) => (n.children?.length ? n.tagName : "spacer"));

test("a bold line on its own gets space above it, but not at the top or in a run", () => {
  const tree: Node = {
    type: "root",
    children: [p(strong("Top")), txt("\n"), p(txt("Para")), p(strong("-God-")), p(strong("-Family-")), { type: "element", tagName: "ul", children: [txt("x")] }, p(strong("Fee"))],
  };
  rehypeSubheadingSpace()(tree as never);
  assert.deepEqual(tags(tree), ["p", "p", "spacer", "p", "p", "ul", "spacer", "p"]);
});

test("preview only ever sends the editor to a page on this site", () => {
  assert.equal(previewPath("/coaches"), "/coaches");
  assert.equal(previewPath("/fall-camp?x=1"), "/fall-camp?x=1");
  for (const bad of [null, "", "https://evil.com", "//evil.com", "/\\evil.com", "/portal/settings", "/api/x", "coaches"]) {
    assert.equal(previewPath(bad), "/", String(bad));
  }
});

test("list items always hold a paragraph, like the original pages' lists", () => {
  const li = (...children: Node[]): Node => ({ type: "element", tagName: "li", properties: {}, children });
  const tree: Node = {
    type: "root",
    children: [{ type: "element", tagName: "ul", properties: {}, children: [txt("\n"), li(strong("Tight")), txt("\n"), li(txt("\n"), p(strong("Loose")), txt("\n"))] }],
  };
  rehypeListParagraphs()(tree as never);
  const [tight, loose] = (tree.children![0].children ?? []).filter((n) => n.tagName === "li");
  assert.deepEqual(tight.children!.map((n) => n.tagName), ["p"]);
  assert.deepEqual(tight.children![0].children!.map((n) => n.tagName), ["strong"]);
  assert.deepEqual(loose.children!.filter((n) => n.type === "element").map((n) => n.tagName), ["p"]);
});
