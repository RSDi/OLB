// Roadmap reads (migration 0129). A failed read comes back as an error to
// show, never as an empty board: "nothing here yet" looks just like a
// working board with no items.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { keyOpens } from "../teams/public-directory-key";
import type { RoadmapItem } from "./model";

const ITEM_COLS = "id, title, description, area, status, released_on, created_at";

export interface RoadmapData {
  items: RoadmapItem[];
  // The public link's key; null when the link is off. Never sent to the
  // public page.
  linkKey: string | null;
  error: string | null;
}

// The board, for a super-admin (RLS allows no one else). A hand-entered
// list, far below PostgREST's 1000-row cap.
export async function loadRoadmap(): Promise<RoadmapData> {
  const supabase = await createClient();
  const [items, link] = await Promise.all([
    supabase.from("olb_roadmap_items").select(ITEM_COLS).is("deleted_at", null),
    supabase.from("olb_roadmap_link").select("key").maybeSingle(),
  ]);
  const failure = items.error ?? link.error;
  if (failure) {
    console.error("[loadRoadmap]", failure.message);
    return { items: [], linkKey: null, error: `The roadmap couldn't be loaded: ${failure.message}` };
  }
  return {
    items: (items.data ?? []) as RoadmapItem[],
    linkKey: (link.data as { key: string | null } | null)?.key ?? null,
    error: null,
  };
}

// The read-only copy at /roadmap/<key>. The key is the only way in: a wrong
// or retired key returns null, and the page answers 404.
export async function loadPublicRoadmap(key: string): Promise<RoadmapData | null> {
  const db = createAdminClient();
  const { data: link } = await db.from("olb_roadmap_link").select("key").maybeSingle();
  if (!keyOpens(key, (link as { key: string | null } | null)?.key)) return null;
  const { data, error } = await db.from("olb_roadmap_items").select(ITEM_COLS).is("deleted_at", null);
  if (error) {
    console.error("[loadPublicRoadmap]", error.message);
    return { items: [], linkKey: null, error: "The roadmap couldn't be loaded. Try again in a few minutes." };
  }
  return { items: (data ?? []) as RoadmapItem[], linkKey: null, error: null };
}
