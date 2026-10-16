// Product Manager bot: list roadmap items and add a proposed one.
//
// Auth is `Authorization: Bearer <OLB_ROADMAP_BOT_TOKEN>`, same shape as the
// cron routes (`CRON_SECRET`) but a dedicated secret. Unset or wrong → 401.
// RLS on olb_roadmap_items is super-admin only, so reads and the insert use
// the service role. POST is insert-only: status is always `proposed`, there
// is never a released_on, and this file has no update or delete. Status
// moves go through PATCH /api/roadmap/items/[id].

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { roadmapBotDeny, roadmapBotNeedServiceRole } from "../../../../lib/roadmap/bot-http";
import { botInsertFields, cleanBotRoadmapItem } from "../../../../lib/roadmap/bot";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_COLS = "id, title, area, status";

export async function GET(request: Request) {
  const denied = roadmapBotDeny(request);
  if (denied) return denied;
  const missing = roadmapBotNeedServiceRole();
  if (missing) return missing;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("olb_roadmap_items")
    .select(LIST_COLS)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[roadmap-items GET]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const denied = roadmapBotDeny(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = cleanBotRoadmapItem(body);
  if ("error" in row) return NextResponse.json({ error: row.error }, { status: 400 });

  const missing = roadmapBotNeedServiceRole();
  if (missing) return missing;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("olb_roadmap_items")
    .insert(botInsertFields(row))
    .select(LIST_COLS)
    .single();
  if (error) {
    console.error("[roadmap-items POST]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  revalidatePath("/portal/roadmap");
  return NextResponse.json({ item: data }, { status: 201 });
}
