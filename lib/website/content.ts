// Page text, pictures, buttons and lists on the public site: the shapes
// Settings → Website saves in site_content (and site_drafts), and the checks
// on them. The spots themselves are listed in ./slots.ts. Everything here is
// checked twice: when it's saved, and again when a page reads it, so a bad
// value can't break a page. Safe to import from client components.

import { normalizeMenuHref, SITE_PAGES } from "./menu.ts"; // explicit extension so node --test can load this file

export type SlotKind = "text" | "markdown" | "image" | "link" | "list";

// A picture uploaded for the site, as saved in site_content.value (JSON).
export interface SiteImageValue {
  url: string;
  width: number;
  height: number;
  alt: string;
}

// One of the pictures built into the site (BUILTIN_IMAGES in ./slots.ts), as
// list items start out, e.g. a coach's portrait.
export interface BuiltinImageRef {
  builtin: string;
  alt: string;
}

export type ImageRef = SiteImageValue | BuiltinImageRef;

export function isBuiltinImage(v: ImageRef): v is BuiltinImageRef {
  return "builtin" in v;
}

// A button: its words and where it goes.
export interface LinkValue {
  label: string;
  href: string;
}

// A field of a list item (a coach's name, a program's description…).
export type FieldType = "text" | "markdown" | "image" | "url" | "slug";

export interface ListField {
  name: string;
  label: string;
  type: FieldType;
  // Must be filled in. Pictures and links are optional unless this is set.
  required?: boolean;
  max?: number;
  help?: string;
}

export type ListItemValue = string | ImageRef | null;
export type ListItem = Record<string, ListItemValue>;

export const SITE_IMAGES_BUCKET = "site-images";
export const SITE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const SITE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const SITE_TEXT_MAX = 20000;
export const SITE_ALT_MAX = 300;
export const SITE_LABEL_MAX = 120;

type Result<T> = { value: T } | { error: string };

// The only addresses a saved picture may point at: the site-images bucket of
// this project's Supabase storage.
export function siteImageUrlPrefix(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${SITE_IMAGES_BUCKET}/`;
}

function json(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// ─── Pictures ────────────────────────────────────────────────────────────────

export function parseImageRef(v: unknown): ImageRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const alt = typeof o.alt === "string" ? o.alt : "";
  if (typeof o.builtin === "string" && o.builtin) return { builtin: o.builtin, alt };
  if (
    typeof o.url === "string" &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    o.width > 0 &&
    o.height > 0
  ) {
    return { url: o.url, width: Math.round(o.width), height: Math.round(o.height), alt };
  }
  return null;
}

// A picture spot's saved value. Junk reads as unset.
export function parseImageValue(value: string | null | undefined): ImageRef | null {
  return parseImageRef(json(value));
}

// Checks a picture before it's saved: an upload to this project's bucket, or
// one of the site's own pictures. `prefix` is siteImageUrlPrefix().
export function cleanImageRef(v: ImageRef, prefix: string | null, builtinIds: readonly string[]): Result<ImageRef> {
  const alt = (v.alt ?? "").trim();
  if (alt.length > SITE_ALT_MAX) return { error: `Keep the description to ${SITE_ALT_MAX} characters or fewer.` };
  if (isBuiltinImage(v)) {
    if (!builtinIds.includes(v.builtin)) return { error: "That picture isn't one of the site's own." };
    return { value: { builtin: v.builtin, alt } };
  }
  if (!prefix || !v.url.startsWith(prefix) || v.url.includes("..")) {
    return { error: "Upload the picture here rather than linking to one elsewhere." };
  }
  if (!(v.width > 0 && v.height > 0 && v.width <= 20000 && v.height <= 20000)) {
    return { error: "Couldn't read that picture's size. Try a different file." };
  }
  return { value: { url: v.url, width: Math.round(v.width), height: Math.round(v.height), alt } };
}

// Kept for the single-picture spots, which only ever hold an upload.
export function cleanImageValue(v: SiteImageValue, prefix: string | null): Result<SiteImageValue> {
  const c = cleanImageRef(v, prefix, []);
  return "error" in c ? c : { value: c.value as SiteImageValue };
}

// Whether a picture can be shown: a known built-in, or an upload from this
// project's bucket (next/image refuses anything else).
export function imageIsShowable(v: ImageRef, prefix: string | null, builtinIds: readonly string[]): boolean {
  return isBuiltinImage(v) ? builtinIds.includes(v.builtin) : !!prefix && v.url.startsWith(prefix);
}

// ─── Text ────────────────────────────────────────────────────────────────────

// Checks text before it's saved: required, and not absurdly long. `max` is
// the spot's own limit for short one-line spots.
export function cleanText(raw: string, max = SITE_TEXT_MAX): Result<string> {
  const value = raw.replace(/\r\n?/g, "\n").trim();
  if (!value) return { error: "Type something, or use Reset to put the original words back." };
  if (value.length > max) return { error: `Keep it to ${max.toLocaleString()} characters or fewer.` };
  return { value };
}

// Single line breaks the editor typed show as line breaks on the page, the
// way people expect, rather than running together as markdown normally does.
export function keepLineBreaks(md: string): string {
  return md.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function parseLink(value: string | null | undefined): LinkValue | null {
  const o = json(value) as Partial<LinkValue> | null;
  if (!o || typeof o.label !== "string" || typeof o.href !== "string" || !o.label.trim()) return null;
  const href = normalizeMenuHref(o.href);
  return href ? { label: o.label, href } : null;
}

export function cleanLink(v: LinkValue, max = SITE_LABEL_MAX): Result<LinkValue> {
  const label = v.label.trim();
  if (!label) return { error: "The button needs words on it." };
  if (label.length > max) return { error: `Keep the button's words to ${max} characters or fewer.` };
  const href = normalizeMenuHref(v.href);
  if (!href) return { error: "Where the button goes needs to be a site page like /contact or a web address like https://example.com." };
  return { value: { label, href } };
}

// ─── New pages' addresses ────────────────────────────────────────────────────

// Addresses a new page can't take: the site's own pages, the portal, and the
// old Squarespace addresses next.config.ts redirects.
export const RESERVED_SLUGS = [
  ...SITE_PAGES.map((p) => p.href.slice(1)).filter(Boolean),
  "api",
  "auth",
  "portal",
  "login",
  "register",
  "reset-password",
  "directory",
  "search",
  "sponsors-1",
  "new-folder",
  "new-dropdown",
  "resources",
  "favicon.ico",
];

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// What someone typed as a page address → a tidy one: "Fall Camp 2026!" →
// "fall-camp-2026".
export function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 60 && !RESERVED_SLUGS.includes(slug);
}

// ─── Lists ───────────────────────────────────────────────────────────────────

export function parseList(value: string | null | undefined): ListItem[] | null {
  const v = json(value);
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is ListItem => !!x && typeof x === "object" && !Array.isArray(x));
}

export interface ListRules {
  fields: readonly ListField[];
  // What one item is called, for messages: "coach", "program".
  itemName: string;
  max: number;
  prefix: string | null;
  builtinIds: readonly string[];
}

// Checks a list before it's saved. Returns the tidied list or the first
// problem, worded for the person editing it.
export function cleanList(items: ListItem[], rules: ListRules): Result<ListItem[]> {
  if (items.length > rules.max) return { error: `There can be up to ${rules.max} of these.` };
  const out: ListItem[] = [];
  const slugs = new Set<string>();
  for (const [i, item] of items.entries()) {
    const titleField = rules.fields.find((f) => f.type === "text");
    const title = titleField && typeof item[titleField.name] === "string" ? (item[titleField.name] as string).trim() : "";
    const name = title ? `"${title}"` : `${rules.itemName[0].toUpperCase()}${rules.itemName.slice(1)} ${i + 1}`;
    const clean: ListItem = {};
    for (const f of rules.fields) {
      const raw = item[f.name];
      const where = `${f.label} on ${name}`;
      if (f.type === "image") {
        const ref = parseImageRef(raw);
        if (!ref) {
          if (f.required) return { error: `${name} needs a picture.` };
          clean[f.name] = null;
          continue;
        }
        const c = cleanImageRef(ref, rules.prefix, rules.builtinIds);
        if ("error" in c) return { error: `${where}: ${c.error}` };
        clean[f.name] = c.value;
        continue;
      }
      const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim() : "";
      if (!text) {
        if (f.required) return { error: `${where} is empty.` };
        clean[f.name] = f.type === "text" || f.type === "markdown" ? "" : null;
        continue;
      }
      const max = f.max ?? (f.type === "markdown" ? SITE_TEXT_MAX : SITE_LABEL_MAX);
      if (text.length > max) return { error: `Keep ${where} to ${max.toLocaleString()} characters or fewer.` };
      if (f.type === "text" && text.includes("\n")) return { error: `Keep ${where} to a single line.` };
      if (f.type === "url") {
        const href = normalizeMenuHref(text);
        if (!href) return { error: `${where} needs to be a site page like /contact or a web address like https://example.com.` };
        clean[f.name] = href;
      } else if (f.type === "slug") {
        const slug = normalizeSlug(text);
        if (!SLUG_RE.test(slug)) return { error: `${where} needs letters or numbers.` };
        if (RESERVED_SLUGS.includes(slug)) return { error: `The site already has a page at /${slug}. Choose another address.` };
        if (slug.length > 60) return { error: `Keep ${where} to 60 characters or fewer.` };
        if (slugs.has(slug)) return { error: `Two pages have the address /${slug}. Give each its own.` };
        slugs.add(slug);
        clean[f.name] = slug;
      } else {
        clean[f.name] = text;
      }
    }
    out.push(clean);
  }
  return { value: out };
}
