// Roadmap Approve (0139): approved_by / approved_at, and the update policy
// stays super-admin only. 0138 is left for the concurrent Release Notes work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0139_roadmap_approve.sql"), "utf8");
const patch = readFileSync(join(root, "app/api/roadmap/items/[id]/route.ts"), "utf8");
const list = readFileSync(join(root, "app/api/roadmap/items/route.ts"), "utf8");
const page = readFileSync(join(root, "app/portal/roadmap/page.tsx"), "utf8");
const view = readFileSync(join(root, "app/portal/roadmap/RoadmapView.tsx"), "utf8");
const actions = readFileSync(join(root, "lib/roadmap/actions.ts"), "utf8");

test("0139 follows 0138 (Release Notes)", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0137_hotel_stay_travel_players.sql"));
  assert.ok(names.includes("0138_release_notes.sql"));
  assert.ok(names.includes("0139_roadmap_approve.sql"));
  assert.equal(names.filter((n) => n.startsWith("0139")).length, 1, "only one 0139 migration");
});

test("0139 adds approved_by and approved_at and keeps update RLS super-admin only", () => {
  assert.ok(migration.includes("approved_by uuid references public.members(id)"));
  assert.ok(migration.includes("approved_at timestamptz"));
  assert.ok(migration.includes("olb_roadmap_items_approved_check"));
  assert.ok(migration.includes("olb_roadmap_items_update"));
  assert.ok(migration.includes("using ((select public.is_super_admin()))"));
  assert.ok(migration.includes("with check ((select public.is_super_admin()))"));
  assert.ok(!migration.includes("using (public.is_super_admin())"));
  assert.ok(!migration.includes("with check (public.is_super_admin())"));
});

test("bot PATCH revalidates the board and refuses a 0-row update", () => {
  assert.ok(patch.includes("refreshRoadmap"));
  assert.ok(patch.includes("botPatchUpdated"));
  assert.ok(!patch.includes(".single()"));
  assert.ok(list.includes("refreshRoadmap"));
  assert.ok(list.includes("botListStatusFilter"));
  assert.ok(list.includes("approved_by_name") || list.includes("botListItem"));
  assert.ok(page.includes('export const dynamic = "force-dynamic"'));
});

test("Approve is a super-admin action on Proposed cards and in the sheet", () => {
  assert.ok(actions.includes("export async function approveRoadmapItem"));
  assert.ok(actions.includes("approved_by: gate.memberId"));
  assert.ok(actions.includes('status: "planned"'));
  assert.ok(actions.includes('.eq("status", "proposed")'));
  assert.ok(view.includes("approveRoadmapItem"));
  assert.ok(view.includes('it.status === "proposed"'));
  assert.ok(view.includes('"Approve"'));
  assert.ok(view.includes("formatApprovedBy"));
});
