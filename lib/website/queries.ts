// Reads the public site's menu and edited spots for the site's pages.
//
// The site's pages are built ahead of time and served from Next's cache, so
// these reads are cached too (tag WEBSITE_TAG): publishing in Settings →
// Website clears the tag, and the next visitor gets a fresh page. They read
// with the public (anon) key and no cookies, the same as any visitor, so they
// don't turn the pages dynamic.
//
// Preview: when an editor turns on preview (/api/website/preview, which sets
// Next's draft-mode cookie), pages render fresh for them and the drafts in
// site_drafts are laid over what's published. Drafts are read as the signed-
// in editor, so RLS shows them only to the Website grant.
//
// If the database can't be reached, or the migrations aren't applied yet, the
// site shows what's built into the code, and that isn't cached, so the next
// request tries again.

import { cache } from "react";
import { draftMode } from "next/headers";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { StaticImageData } from "next/image";
import { createClient as createSessionClient } from "../supabase/server";
import { DEFAULT_MENU, menuFromInput, menuFromRows, type MenuInput, type MenuRow, type NavItem } from "./menu";
import {
  imageIsShowable,
  isBuiltinImage,
  parseImageRef,
  parseImageValue,
  parseLink,
  parseList,
  siteImageUrlPrefix,
  type ImageRef,
  type LinkValue,
  type ListItem,
} from "./content";
import {
  BUILTIN_IMAGE_IDS,
  BUILTIN_IMAGES,
  findSlot,
  type ImageSlotKey,
  type LinkSlotKey,
  type ListSlotKey,
  type SlotKey,
  type TextSlotKey,
} from "./slots";

export const WEBSITE_TAG = "website";

// A safety net in case a publish's cache clear is missed: pages pick up
// changes within this many seconds anyway.
const REVALIDATE_SECONDS = 600;

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase isn't configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const loadMenuRows = unstable_cache(
  async (): Promise<MenuRow[]> => {
    const { data, error } = await anonClient()
      .from("site_menu_items")
      .select("id, parent_id, label, href, sort_order");
    if (error) throw new Error(error.message);
    return (data as MenuRow[]) ?? [];
  },
  ["website-menu"],
  { tags: [WEBSITE_TAG], revalidate: REVALIDATE_SECONDS },
);

const loadContentRows = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const { data, error } = await anonClient().from("site_content").select("key, value");
    if (error) throw new Error(error.message);
    return Object.fromEntries(((data as { key: string; value: string }[]) ?? []).map((r) => [r.key, r.value]));
  },
  ["website-content"],
  { tags: [WEBSITE_TAG], revalidate: REVALIDATE_SECONDS },
);

// The drafts, when this visitor is previewing; null otherwise. Once per
// request (the layout and the page both ask).
const loadDrafts = cache(async (): Promise<Record<string, string | null> | null> => {
  if (!(await draftMode()).isEnabled) return null;
  try {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.from("site_drafts").select("key, value");
    if (error) return {};
    return Object.fromEntries(((data as { key: string; value: string | null }[]) ?? []).map((r) => [r.key, r.value]));
  } catch {
    return {};
  }
});

// Whether this visitor is previewing, and how many unpublished changes the
// preview shows.
export async function getPreviewState(): Promise<{ enabled: boolean; changes: number }> {
  const drafts = await loadDrafts();
  return { enabled: drafts !== null, changes: drafts ? Object.keys(drafts).length : 0 };
}

export async function getSiteMenu(): Promise<NavItem[]> {
  const drafts = await loadDrafts();
  if (drafts && "menu" in drafts) {
    const draft = drafts.menu;
    if (draft === null) return DEFAULT_MENU;
    try {
      return menuFromInput(JSON.parse(draft) as MenuInput[]) ?? DEFAULT_MENU;
    } catch {
      return DEFAULT_MENU;
    }
  }
  try {
    return menuFromRows(await loadMenuRows()) ?? DEFAULT_MENU;
  } catch {
    return DEFAULT_MENU;
  }
}

// A picture for next/image: an upload, sized, or one of the site's own.
export interface SitePicture {
  src: StaticImageData;
  alt: string;
}

// One item of a list spot, for a page to read field by field.
export interface SiteListItem {
  text(field: string): string;
  // A site page or web address, already checked; null if it's empty.
  url(field: string): string | null;
  image(field: string): SitePicture | null;
}

export interface SiteContent {
  text(key: TextSlotKey): string;
  image(key: ImageSlotKey): SitePicture;
  link(key: LinkSlotKey): LinkValue;
  list(key: ListSlotKey): SiteListItem[];
  // Whether someone has changed this spot (published, or in the preview).
  edited(key: SlotKey): boolean;
}

const PLACEHOLDER: StaticImageData = { src: "", width: 1, height: 1 };

function toPicture(ref: ImageRef | null, prefix: string | null): SitePicture | null {
  if (!ref || !imageIsShowable(ref, prefix, BUILTIN_IMAGE_IDS)) return null;
  if (isBuiltinImage(ref)) return { src: BUILTIN_IMAGES[ref.builtin], alt: ref.alt };
  return { src: { src: ref.url, width: ref.width, height: ref.height }, alt: ref.alt };
}

function toListItem(item: ListItem, prefix: string | null): SiteListItem {
  return {
    text: (f) => (typeof item[f] === "string" ? (item[f] as string) : ""),
    url: (f) => {
      const v = item[f];
      return typeof v === "string" && v ? normalizeHref(v) : null;
    },
    image: (f) => toPicture(parseImageRef(item[f]), prefix),
  };
}

function normalizeHref(v: string): string | null {
  return /^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v) ? v : null;
}

// Every edited spot, read once per page. Spots nobody has edited give their
// defaults from ./slots.ts; when previewing, drafts are laid over the top.
export async function getSiteContent(): Promise<SiteContent> {
  let saved: Record<string, string> = {};
  try {
    saved = { ...(await loadContentRows()) };
  } catch {
    // Use the defaults.
  }
  const drafts = await loadDrafts();
  if (drafts) {
    for (const [key, value] of Object.entries(drafts)) {
      if (key === "menu") continue;
      if (value === null) delete saved[key];
      else saved[key] = value;
    }
  }
  const prefix = siteImageUrlPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL);

  return {
    text(key) {
      const slot = findSlot(key);
      const value = saved[key];
      if (value) return value;
      return slot && (slot.kind === "text" || slot.kind === "markdown") ? slot.default : "";
    },
    image(key) {
      const slot = findSlot(key);
      const fallback: SitePicture =
        slot?.kind === "image" ? { src: slot.default, alt: slot.defaultAlt } : { src: PLACEHOLDER, alt: "" };
      return toPicture(parseImageValue(saved[key]), prefix) ?? fallback;
    },
    link(key) {
      const slot = findSlot(key);
      const fallback = slot?.kind === "link" ? slot.default : { label: "", href: "/" };
      return parseLink(saved[key]) ?? fallback;
    },
    list(key) {
      const slot = findSlot(key);
      const items = parseList(saved[key]) ?? (slot?.kind === "list" ? [...slot.default] : []);
      return items.map((item) => toListItem(item, prefix));
    },
    edited(key) {
      return key in saved;
    },
  };
}

// A page added in Settings → Website → New pages, by its address.
export async function getSitePage(slug: string): Promise<SiteListItem | null> {
  const content = await getSiteContent();
  return content.list("pages.list").find((p) => p.text("slug") === slug) ?? null;
}
