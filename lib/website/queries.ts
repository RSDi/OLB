// Reads the public site's menu and edited spots for the site's pages.
//
// The site's pages are built ahead of time and served from Next's cache, so
// these reads are cached too (tag WEBSITE_TAG): Settings → Website clears the
// tag when it saves, and the next visitor gets a fresh page. They read with
// the public (anon) key and no cookies, the same as any visitor, so they
// don't turn the pages dynamic.
//
// If the database can't be reached, or migration 0120 isn't applied yet, the
// site shows what's built into the code, and that isn't cached, so the next
// request tries again.

import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import type { StaticImageData } from "next/image";
import { DEFAULT_MENU, menuFromRows, type MenuRow, type NavItem } from "./menu";
import { parseImageValue } from "./content";
import { findSlot, type ImageSlotKey, type TextSlotKey } from "./slots";

export const WEBSITE_TAG = "website";

// A safety net in case a save's cache clear is missed: pages pick up
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

export async function getSiteMenu(): Promise<NavItem[]> {
  try {
    return menuFromRows(await loadMenuRows()) ?? DEFAULT_MENU;
  } catch {
    return DEFAULT_MENU;
  }
}

// A picture for next/image: the uploaded one, sized, or the page's own.
export interface SitePicture {
  src: StaticImageData;
  alt: string;
}

export interface SiteContent {
  text(key: TextSlotKey): string;
  image(key: ImageSlotKey): SitePicture;
}

// Every edited spot, read once per page. Spots nobody has edited give their
// defaults from ./slots.ts.
export async function getSiteContent(): Promise<SiteContent> {
  let saved: Record<string, string> = {};
  try {
    saved = await loadContentRows();
  } catch {
    // Use the defaults.
  }
  return {
    text(key) {
      const slot = findSlot(key);
      const value = saved[key];
      if (value) return value;
      return slot && slot.kind !== "image" ? slot.default : "";
    },
    image(key) {
      const slot = findSlot(key);
      const fallback: SitePicture =
        slot?.kind === "image" ? { src: slot.default, alt: slot.defaultAlt } : { src: { src: "", width: 1, height: 1 }, alt: "" };
      const v = parseImageValue(saved[key]);
      return v ? { src: { src: v.url, width: v.width, height: v.height }, alt: v.alt } : fallback;
    },
  };
}
