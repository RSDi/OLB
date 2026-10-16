// Product Manager bot: move one roadmap item one column forward.
//
// Auth is the same Bearer token as GET/POST /api/roadmap/items. PATCH accepts
// only `{ status }` and optional `preview_url`. Allowed steps: proposed →
// planned → progress → preview → released. preview_url is required on
// progress → preview. Same column, a skip, backwards, or any other field is
// 400. Unknown or deleted id is 404. A write that matches 0 rows is 409, not
// 200. POST remains insert-only as proposed. After a successful write the
// portal board and the public share page are revalidated so they don't stay
// on the old column.

import { NextResponse } from "next/server";
import { roadmapBotDeny, roadmapBotNeedServiceRole } from "../../../../../lib/roadmap/bot-http";
import { botPatchFields, botPatchUpdated, cleanBotStatusPatch } from "../../../../../lib/roadmap/bot";
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

  const row = botPatchFields(
    {
      status,
      preview_url: typeof current.preview_url === "string" ? current.preview_url : null,
      released_on: typeof current.released_on === "string" ? current.released_on : null,
    },
    patch,
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
  refreshRoadmap();
  return NextResponse.json({ item: applied.item });
}
