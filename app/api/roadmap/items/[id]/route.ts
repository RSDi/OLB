// Product Manager bot: move one roadmap item to any board column, and/or
// add a note.
//
// Auth is the same Bearer token as GET/POST /api/roadmap/items. PATCH accepts
// only `{ status }`, optional `preview_url`, and optional `note`. Any board
// column is allowed, including Parked, the same column, a skip, and
// backwards. preview_url is required when landing on Preview without a link
// already on the card. Same extra-field, unknown-column, and missing-body
// rules as before: 400. Unknown or deleted id is 404. A write that matches
// 0 rows is 409, not 200. There is no DELETE. POST remains insert-only as
// proposed. After a successful write the portal board and the public share
// page are revalidated so they don't stay on the old column, and a history
// row is stored (bot, from, to, note, when).

import { NextResponse } from "next/server";
import { roadmapBotDeny, roadmapBotNeedServiceRole } from "../../../../../lib/roadmap/bot-http";
import { botPatchEvent, botPatchFields, botPatchUpdated, cleanBotStatusPatch } from "../../../../../lib/roadmap/bot";
import { refreshRoadmap } from "../../../../../lib/roadmap/cache";
import { isStatus, type Status } from "../../../../../lib/roadmap/model";
import { createAdminClient } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITEM_COLS = "id, title, area, status, preview_url, released_on";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = roadmapBotDeny(request);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "That item isn't on the roadmap." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = cleanBotStatusPatch(body);
  if ("error" in patch) return NextResponse.json({ error: patch.error }, { status: 400 });

  const missing = roadmapBotNeedServiceRole();
  if (missing) return missing;

  const admin = createAdminClient();
  const { data: current, error: loadError } = await admin
    .from("olb_roadmap_items")
    .select("status, preview_url, released_on")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (loadError) {
    console.error("[roadmap-items PATCH]", loadError.message);
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!current) return NextResponse.json({ error: "That item isn't on the roadmap." }, { status: 404 });

  const status = isStatus(current.status) ? (current.status as Status) : null;
  if (!status) return NextResponse.json({ error: "That item isn't on the roadmap." }, { status: 404 });

  const now = new Date();
  const row = botPatchFields(
    {
      status,
      preview_url: typeof current.preview_url === "string" ? current.preview_url : null,
      released_on: typeof current.released_on === "string" ? current.released_on : null,
    },
    patch,
    now,
  );
  if ("error" in row) return NextResponse.json({ error: row.error }, { status: 400 });

  const { data, error } = await admin
    .from("olb_roadmap_items")
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select(ITEM_COLS);
  if (error) {
    console.error("[roadmap-items PATCH]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const applied = botPatchUpdated(data);
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });

  const event = botPatchEvent(status, row.status, patch.note ?? null, now);
  const { error: eventError } = await admin.from("olb_roadmap_events").insert({ item_id: id, ...event });
  refreshRoadmap();
  if (eventError) {
    console.error("[roadmap-items PATCH event]", eventError.message);
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }
  return NextResponse.json({ item: applied.item });
}
