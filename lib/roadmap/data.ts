// Roadmap reads (migrations 0129, 0136, 0139 and 0154). A failed read comes
// back as an error to show, never as an empty board: "nothing here yet"
// looks just like a working board with no items.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { keyOpens } from "../teams/public-directory-key";
import { isStatus, latestNote, type RoadmapEvent, type RoadmapItem, type Status } from "./model";

const ITEM_COLS =
  "id, title, description, area, status, released_on, preview_url, created_at, approved_by, approved_at, approver:members!approved_by(full_name)";

const EVENT_COLS = "id, item_id, actor, from_status, to_status, note, created_at";

function asEvent(raw: unknown): RoadmapEvent | null {
  const r = raw as {
    id?: unknown;
    actor?: unknown;
    from_status?: unknown;
    to_status?: unknown;
    note?: unknown;
    created_at?: unknown;
  };
  if (typeof r.id !== "string" || typeof r.created_at !== "string") return null;
  if (typeof r.from_status !== "string" || !isStatus(r.from_status)) return null;
  if (typeof r.to_status !== "string" || !isStatus(r.to_status)) return null;
  return {
    id: r.id,
    actor: typeof r.actor === "string" && r.actor.trim() ? r.actor : "bot",
    from_status: r.from_status as Status,
    to_status: r.to_status as Status,
    note: typeof r.note === "string" && r.note.trim() ? r.note : null,
    created_at: r.created_at,
  };
}

function eventsByItem(rows: unknown[] | null): Map<string, RoadmapEvent[]> {
  const map = new Map<string, RoadmapEvent[]>();
  for (const raw of rows ?? []) {
    const r = raw as { item_id?: unknown };
    if (typeof r.item_id !== "string") continue;
    const ev = asEvent(raw);
    if (!ev) continue;
    const list = map.get(r.item_id) ?? [];
    list.push(ev);
    map.set(r.item_id, list);
  }
  return map;
}

function asItems(rows: unknown[] | null, history: Map<string, RoadmapEvent[]> = new Map()): RoadmapItem[] {
  return (rows ?? []).map((raw) => {
    const r = raw as RoadmapItem & {
      approver?: { full_name: string | null } | { full_name: string | null }[] | null;
    };
    const approver = Array.isArray(r.approver) ? r.approver[0] : r.approver;
    const events = history.get(r.id) ?? [];
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      area: r.area,
      status: r.status,
      released_on: r.released_on,
      preview_url: r.preview_url,
      created_at: r.created_at,
      approved_by: r.approved_by ?? null,
      approved_at: r.approved_at ?? null,
      approved_by_name: approver?.full_name?.trim() || null,
      latest_note: latestNote(events),
      events,
    };
  });
}

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
  const [items, link, events] = await Promise.all([
    supabase.from("olb_roadmap_items").select(ITEM_COLS).is("deleted_at", null),
    supabase.from("olb_roadmap_link").select("key").maybeSingle(),
    supabase.from("olb_roadmap_events").select(EVENT_COLS).order("created_at", { ascending: true }),
  ]);
  const failure = items.error ?? link.error ?? events.error;
  if (failure) {
    console.error("[loadRoadmap]", failure.message);
    return { items: [], linkKey: null, error: `The roadmap couldn't be loaded: ${failure.message}` };
  }
  return {
    items: asItems(items.data, eventsByItem(events.data)),
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
  return { items: asItems(data), linkKey: null, error: null };
}
