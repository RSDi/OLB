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
