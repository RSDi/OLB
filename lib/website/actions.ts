"use server";

// Settings → Website: saving drafts of the public site's menu, page text,
// pictures, buttons and lists, and publishing them. A board member with the
// Website grant, or a super-admin — here and in RLS (migrations 0120, 0121).
//
// Every save is a draft (site_drafts): only the editors see it, in the
// preview, until someone publishes. Publishing makes every draft live at
// once (publish_site_drafts) and refreshes the site.

import { revalidatePath, updateTag } from "next/cache";
import { requireWebsite } from "../auth/guards";
import { createClient } from "../supabase/server";
import {
  cleanImageRef,
  cleanLink,
  cleanList,
  cleanText,
  siteImageUrlPrefix,
  type ImageRef,
  type LinkValue,
  type ListItem,
} from "./content";
import { cleanMenu, type MenuInput } from "./menu";
import { WEBSITE_TAG } from "./queries";
import { BUILTIN_IMAGE_IDS, findSlot } from "./slots";

export interface WebsiteResult {
  success?: boolean;
  error?: string;
}

function prefix() {
  return siteImageUrlPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

async function saveDraft(key: string, value: string | null, userId: string): Promise<WebsiteResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_drafts")
    .upsert({ key, value, updated_at: new Date().toISOString(), updated_by: userId }, { onConflict: "key" });
  if (error) return { error: error.message };
  return { success: true };
}

export async function saveSiteMenu(input: MenuInput[]): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const c = cleanMenu(input);
  if ("error" in c) return { error: c.error };
  return saveDraft("menu", JSON.stringify(c.menu), gate.userId);
}

// A draft that puts the menu built into the site back, once published.
export async function resetSiteMenu(): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  return saveDraft("menu", null, gate.userId);
}

export async function saveSiteText(key: string, value: string): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || (slot.kind !== "text" && slot.kind !== "markdown")) {
    return { error: "That isn't a spot on the site that takes text." };
  }
  const c = cleanText(value, slot.kind === "text" ? slot.max : undefined);
  if ("error" in c) return { error: c.error };
  if (slot.kind === "text" && !slot.multiline && c.value.includes("\n")) {
    return { error: "Keep this one to a single line." };
  }
  return saveDraft(key, c.value, gate.userId);
}

export async function saveSiteImage(key: string, image: ImageRef): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || slot.kind !== "image") return { error: "That isn't a spot on the site that takes a picture." };
  // A single picture spot holds an upload; its original is the default.
  if ("builtin" in image) return { error: "Upload a picture, or use Reset to put the original back." };
  const c = cleanImageRef(image, prefix(), []);
  if ("error" in c) return { error: c.error };
  return saveDraft(key, JSON.stringify(c.value), gate.userId);
}

export async function saveSiteLink(key: string, link: LinkValue): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || slot.kind !== "link") return { error: "That isn't a button on the site." };
  const c = cleanLink(link, slot.max);
  if ("error" in c) return { error: c.error };
  return saveDraft(key, JSON.stringify(c.value), gate.userId);
}

export async function saveSiteList(key: string, items: ListItem[]): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const slot = findSlot(key);
  if (!slot || slot.kind !== "list") return { error: "That isn't a list on the site." };
  const c = cleanList(items, {
    fields: slot.fields,
    itemName: slot.itemName,
    max: slot.max,
    prefix: prefix(),
    builtinIds: BUILTIN_IMAGE_IDS,
  });
  if ("error" in c) return { error: c.error };
  return saveDraft(key, JSON.stringify(c.value), gate.userId);
}

// A draft that puts the page's own words, picture or list back, once
// published.
export async function resetSiteSlot(key: string): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  if (!findSlot(key)) return { error: "That isn't a spot on the site." };
  return saveDraft(key, null, gate.userId);
}

// Throws away one draft ("menu" or a spot's key), or every draft.
export async function discardDraft(key: string | null): Promise<WebsiteResult> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const q = supabase.from("site_drafts").delete();
  const { error } = await (key === null ? q.neq("key", "") : q.eq("key", key));
  if (error) return { error: error.message };
  return { success: true };
}

export async function publishDrafts(): Promise<WebsiteResult & { published?: number }> {
  const gate = await requireWebsite();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_site_drafts");
  if (error) return { error: error.message };
  // Every public page shows the menu and footer, so refresh them all.
  updateTag(WEBSITE_TAG);
  revalidatePath("/", "layout");
  return { success: true, published: (data as number | null) ?? 0 };
}
