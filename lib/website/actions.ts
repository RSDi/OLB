"use server";

// Settings → Website: saving the public site's menu, page text and pictures.
// A board member with the Website grant, or a super-admin — here and in RLS
// (migration 0120).

import { revalidatePath, updateTag } from "next/cache";
import { requireWebsite } from "../auth/guards";
import { createClient } from "../supabase/server";
import { cleanImageValue, cleanText, siteImageUrlPrefix, type SiteImageValue } from "./content";
import { cleanMenu, type MenuInput } from "./menu";
import { WEBSITE_TAG } from "./queries";
import { findSlot } from "./slots";

export interface WebsiteResult {
  success?: boolean;
  error?: string;
}

// Every public page shows the menu and footer, so refresh them all.
function refresh() {
  updateTag(WEBSITE_TAG);
  revalidatePath("/", "layout");
}

export async function saveSiteMenu(input: MenuInput[]): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const c = cleanMenu(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_site_menu", { items: c.menu });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Back to the menu built into the site.
export async function resetSiteMenu(): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_site_menu", { items: [] });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function saveSiteText(key: string, value: string): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || slot.kind === "image") return { error: "That isn't a spot on the site that takes text." };
  const c = cleanText(value, slot.kind === "text" ? slot.max : undefined);
  if ("error" in c) return { error: c.error };
  if (slot.kind === "text" && !slot.multiline && c.value.includes("\n")) {
    return { error: "Keep this one to a single line." };
  }
  return upsert(key, c.value, gate.userId);
}

export async function saveSiteImage(key: string, image: SiteImageValue): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || slot.kind !== "image") return { error: "That isn't a spot on the site that takes a picture." };
  const c = cleanImageValue(image, siteImageUrlPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL));
  if ("error" in c) return { error: c.error };
  return upsert(key, JSON.stringify(c.value), gate.userId);
}

// Back to the words or picture built into the page.
export async function resetSiteSlot(key: string): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  if (!findSlot(key)) return { error: "That isn't a spot on the site." };
  const supabase = await createClient();
  const { error } = await supabase.from("site_content").delete().eq("key", key);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

async function upsert(key: string, value: string, userId: string): Promise<WebsiteResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_content")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}
