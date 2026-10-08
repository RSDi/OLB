// The public site's top menu: what Settings → Website → Menu edits and the
// site header shows. Until a menu is saved (site_menu_items is empty) the
// site uses DEFAULT_MENU. Safe to import from client components.

export const PLAYER_HANDBOOK_URL =
  "https://drive.google.com/file/d/124S_qN47dtCvRyezXGfx8EcA-7C5W2Ke/view?usp=sharing";

export const MENU_LABEL_MAX = 40;
export const MENU_MAX_ITEMS = 12;
export const MENU_MAX_CHILDREN = 12;

export type NavLink = { label: string; href: string; external?: boolean };
export type NavFolder = { label: string; children: NavLink[] };
export type NavItem = NavLink | NavFolder;

export function isFolder(item: NavItem): item is NavFolder {
  return "children" in item;
}

export const DEFAULT_MENU: NavItem[] = [
  {
    label: "About",
    children: [
      { label: "Philosophy", href: "/philosophy" },
      { label: "History", href: "/history" },
    ],
  },
  {
    label: "Programs",
    children: [
      { label: "SUMMER 2026", href: "/summer" },
      { label: "2026-27 Season", href: "/programs" },
    ],
  },
  { label: "Coaches", href: "/coaches" },
  { label: "Sponsors", href: "/sponsors" },
  {
    label: "Resources",
    children: [{ label: "Player Handbook", href: PLAYER_HANDBOOK_URL, external: true }],
  },
];

// The site's own pages, offered when picking where a menu item goes.
export const SITE_PAGES: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/philosophy", label: "Philosophy" },
  { href: "/history", label: "History" },
  { href: "/summer", label: "Summer" },
  { href: "/programs", label: "Programs (season)" },
  { href: "/coaches", label: "Coaches" },
  { href: "/sponsors", label: "Sponsors" },
  { href: "/contact", label: "Contact" },
  { href: "/assistance", label: "Assistance" },
  { href: "/meeting-times", label: "Meeting Times" },
  { href: "/player-registration", label: "Player Registration" },
];

// A web address opens in a new tab; a site page doesn't.
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

// Tidies what someone typed as a menu link: a site page ("/coaches", or just
// "coaches") or a web address ("https://…", or "www.…"). Null if it's neither.
export function normalizeMenuHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return u.hostname.includes(".") ? u.toString() : null;
    } catch {
      return null;
    }
  }
  if (/^www\./i.test(v)) return normalizeMenuHref(`https://${v}`);
  if (/\s/.test(v) || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith("//")) return null;
  const path = v.startsWith("/") ? v : `/${v}`;
  return /^\/[A-Za-z0-9\-._~/?#&=%]*$/.test(path) ? path : null;
}

// One row of site_menu_items.
export interface MenuRow {
  id: string;
  parent_id: string | null;
  label: string;
  href: string | null;
  sort_order: number;
}

// Rows from site_menu_items → the menu. Null when there are none (the site
// then uses DEFAULT_MENU). A folder whose links are all gone is dropped.
export function menuFromRows(rows: MenuRow[]): NavItem[] | null {
  const tops = rows.filter((r) => !r.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const items: NavItem[] = [];
  for (const top of tops) {
    const children = rows
      .filter((r) => r.parent_id === top.id && r.href)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => link(r.label, r.href!));
    if (children.length) items.push({ label: top.label, children });
    else if (top.href) items.push(link(top.label, top.href));
  }
  return items.length ? items : null;
}

function link(label: string, href: string): NavLink {
  return isExternalHref(href) ? { label, href, external: true } : { label, href };
}

// What the editor sends to be saved.
export interface MenuInput {
  label: string;
  // Ignored on a folder (an item with children).
  href: string;
  children: { label: string; href: string }[];
}

export function menuToInput(menu: NavItem[]): MenuInput[] {
  return menu.map((item) =>
    isFolder(item)
      ? { label: item.label, href: "", children: item.children.map((c) => ({ label: c.label, href: c.href })) }
      : { label: item.label, href: item.href, children: [] },
  );
}

// Checks and tidies a menu before it's saved. Returns the cleaned menu or
// the first problem, worded for the person editing it.
export function cleanMenu(input: MenuInput[]): { menu: MenuInput[] } | { error: string } {
  if (input.length === 0) return { error: "The menu needs at least one item." };
  if (input.length > MENU_MAX_ITEMS) return { error: `The menu can have up to ${MENU_MAX_ITEMS} items.` };
  const out: MenuInput[] = [];
  // The phone menu opens a folder by its name, so two can't share one.
  const folderNames = new Set<string>();
  for (const [i, item] of input.entries()) {
    const label = item.label.trim();
    const name = label ? `"${label}"` : `Item ${i + 1}`;
    if (!label) return { error: `${name} needs a label.` };
    if (label.length > MENU_LABEL_MAX) return { error: `Keep ${name} to ${MENU_LABEL_MAX} characters or fewer.` };
    if (item.children.length) {
      if (folderNames.has(label.toLowerCase())) return { error: `Two folders are named ${name}. Give each its own name.` };
      folderNames.add(label.toLowerCase());
    }
    if (item.children.length > MENU_MAX_CHILDREN) {
      return { error: `${name} can hold up to ${MENU_MAX_CHILDREN} links.` };
    }
    if (item.children.length) {
      const children: MenuInput["children"] = [];
      for (const [j, child] of item.children.entries()) {
        const childLabel = child.label.trim();
        const childName = childLabel ? `"${childLabel}"` : `Link ${j + 1} under ${name}`;
        if (!childLabel) return { error: `${childName} needs a label.` };
        if (childLabel.length > MENU_LABEL_MAX) {
          return { error: `Keep ${childName} to ${MENU_LABEL_MAX} characters or fewer.` };
        }
        const href = normalizeMenuHref(child.href);
        if (!href) return { error: `${childName} needs a site page like /coaches or a web address like https://example.com.` };
        children.push({ label: childLabel, href });
      }
      out.push({ label, href: "", children });
    } else {
      const href = normalizeMenuHref(item.href);
      if (!href) return { error: `${name} needs a site page like /coaches or a web address like https://example.com.` };
      out.push({ label, href, children: [] });
    }
  }
  return { menu: out };
}
