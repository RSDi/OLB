"use server";

// Settings → Messages. Registrations permission only. Writes with the
// service role so a missing RLS policy can't block the save; the permission
// check still runs first.

import { revalidatePath, updateTag } from "next/cache";
import { requireRegistrations } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { loadHomepageMessage } from "./homepage-message-data";
import {
  HOMEPAGE_MESSAGE_TAG,
  PROGRAMS_HERO_KEY,
  cleanHomepageMessage,
  tableMissing,
  type HomepageMessage,
  type HomepageMessageInput,
} from "./homepage-message";

type LoadResult = { message: HomepageMessage; fromTable: boolean; error?: string };
type SaveResult = { error?: string };

function refresh() {
  updateTag(HOMEPAGE_MESSAGE_TAG);
  revalidatePath("/programs");
  revalidatePath("/portal/settings");
}

export async function loadHomepageMessageSettings(): Promise<LoadResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { message: { key: PROGRAMS_HERO_KEY, enabled: false, body: "", link_text: "", link_url: "" }, fromTable: false, error: gate.error };
  try {
    return await loadHomepageMessage();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load the message.";
    return { message: { key: PROGRAMS_HERO_KEY, enabled: false, body: "", link_text: "", link_url: "" }, fromTable: false, error: message };
  }
}

export async function saveHomepageMessage(input: HomepageMessageInput): Promise<SaveResult> {
  const gate = await requireRegistrations();
  if ("error" in gate) return { error: gate.error };
  const cleaned = cleanHomepageMessage(input);
  if ("error" in cleaned) return { error: cleaned.error };
  const db = createAdminClient();
  const row = {
    key: PROGRAMS_HERO_KEY,
    enabled: cleaned.value.enabled,
    body: cleaned.value.body,
    link_text: cleaned.value.link_text,
    link_url: cleaned.value.link_url,
    updated_by: gate.userId,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("olb_homepage_messages").upsert(row, { onConflict: "key" });
  if (error) {
    if (tableMissing(error)) {
      return { error: "Messages aren't in this database yet. Paste the SQL from the pull request, then try again." };
    }
    return { error: error.message };
  }
  refresh();
  return {};
}
