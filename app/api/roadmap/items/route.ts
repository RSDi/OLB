// Product Manager bot: list roadmap items and add a proposed one.
//
// Auth is `Authorization: Bearer <OLB_ROADMAP_BOT_TOKEN>`, same shape as the
// cron routes (`CRON_SECRET`) but a dedicated secret. Unset or wrong → 401.
// RLS on olb_roadmap_items is super-admin only, so reads and the insert use
// the service role. POST is insert-only: status is always `proposed`, there
// is never a released_on, and this route has no update or delete.

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { botInsertFields, cleanBotRoadmapItem, ROADMAP_BOT_TOKEN_ENV, roadmapBotAuthorized } from "../../../../lib/roadmap/bot";
import { createAdminClient } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_COLS = "id, title, area, status";

function unauthorized(expected: string | undefined): NextResponse {
  if (!expected) console.error(`roadmap-items: ${ROADMAP_BOT_TOKEN_ENV} not configured`);
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function authorize(request: Request): NextResponse | null {
  const expected = process.env[ROADMAP_BOT_TOKEN_ENV];
  if (!roadmapBotAuthorized(request.headers.get("authorization"), expected)) {
    return unauthorized(expected);
  }
  return null;
}

function needServiceRole(): NextResponse | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return NextResponse.json(
    { error: "SUPABASE_SERVICE_ROLE_KEY not set; the roadmap bot cannot read or write items (RLS blocks unauthenticated writes)." },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const missing = needServiceRole();
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
  const denied = authorize(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = cleanBotRoadmapItem(body);
  if ("error" in row) return NextResponse.json({ error: row.error }, { status: 400 });

  const missing = needServiceRole();
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
