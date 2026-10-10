"use server";

// Roadmap edits (/portal/roadmap, migration 0129). Super-admins on the
// preview list only, here and (for super-admins) in RLS.

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards";
import { getAuthUser } from "../auth/viewer";
import { seesFullUi } from "../auth/feature-preview";
import { createClient } from "../supabase/server";
import { randomKey } from "../teams/public-directory-key";
import { cleanRoadmapItem, type RoadmapItemInput } from "./model";

export interface RoadmapResult {
  success?: boolean;
  error?: string;
}

async function requireRoadmap(): Promise<{ error: string } | { userId: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate;
  const user = await getAuthUser();
  if (!seesFullUi(user?.email)) return { error: "The roadmap isn't available on your account yet." };
  return gate;
}

function refresh() {
  revalidatePath("/portal/roadmap");
}

// A new item when id is null, otherwise an edit.
export async function saveRoadmapItem(id: string | null, input: RoadmapItemInput): Promise<RoadmapResult> {
  const gate = await requireRoadmap();
  if ("error" in gate) return { error: gate.error };
  const row = cleanRoadmapItem(input);
  if ("error" in row) return { error: row.error };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("olb_roadmap_items").update(row).eq("id", id).is("deleted_at", null)
    : await supabase.from("olb_roadmap_items").insert({ ...row, created_by: gate.userId });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function deleteRoadmapItem(id: string): Promise<RoadmapResult> {
  const gate = await requireRoadmap();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_roadmap_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// "new" turns the public link on, or swaps in a fresh key so the old link
// stops working; "off" turns it off.
export async function setRoadmapLink(action: "new" | "off"): Promise<RoadmapResult> {
  const gate = await requireRoadmap();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_roadmap_link")
    .update({ key: action === "new" ? randomKey() : null, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}
