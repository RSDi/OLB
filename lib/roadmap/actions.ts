"use server";

// Roadmap edits (/portal/roadmap, migrations 0129, 0136, 0139 and 0154). Super-admins
// on the preview list only, here and (for super-admins) in RLS. Approve is the
// same gate: only a super-admin can move Proposed → Planned and stamp
// approved_by / approved_at. Parked is a regular column on the form. Bot
// notes live in olb_roadmap_events and are read-only here.

import { requireSuperAdmin } from "../auth/guards";
import { getViewer } from "../auth/viewer";
import { createClient } from "../supabase/server";
import { randomKey } from "../teams/public-directory-key";
import { refreshRoadmap } from "./cache";
import { cleanRoadmapItem, type RoadmapItemInput } from "./model";

export interface RoadmapResult {
  success?: boolean;
  error?: string;
}

async function requireRoadmap(): Promise<{ error: string } | { userId: string; memberId: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return gate;
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!viewer.seesFullUi) return { error: "The roadmap isn't available on your account yet." };
  return { userId: gate.userId, memberId: viewer.memberId };
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
  refreshRoadmap();
  return { success: true };
}

// Super-admins only (here and in RLS). Proposed → Planned, and records who
// approved it. A miss (gone, already moved, or RLS blocked) is an error so
// the board never thinks it worked.
export async function approveRoadmapItem(id: string): Promise<RoadmapResult> {
  const gate = await requireRoadmap();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("olb_roadmap_items")
    .update({
      status: "planned",
      approved_by: gate.memberId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "proposed")
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "That item isn't proposed any more." };
  refreshRoadmap();
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
  refreshRoadmap();
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
  refreshRoadmap();
  return { success: true };
}
