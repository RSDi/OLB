// Roadmap Parked + bot notes (0154): parked is a status, history is
// append-only for super-admins to read, and PATCH still uses the same bot
// Bearer gate with no DELETE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0154_roadmap_parked_notes.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0154_roadmap_parked_notes_down.sql"), "utf8");
const patch = readFileSync(join(root, "app/api/roadmap/items/[id]/route.ts"), "utf8");
const list = readFileSync(join(root, "app/api/roadmap/items/route.ts"), "utf8");
const botHttp = readFileSync(join(root, "lib/roadmap/bot-http.ts"), "utf8");
const view = readFileSync(join(root, "app/portal/roadmap/RoadmapView.tsx"), "utf8");
const model = readFileSync(join(root, "lib/roadmap/model.ts"), "utf8");

test("0154 follows 0153", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0153_planning_roles_invoicing_holder.sql"));
  assert.ok(names.includes("0154_roadmap_parked_notes.sql"));
  assert.equal(names.filter((n) => n.startsWith("0154")).length, 1, "only one 0154 migration");
});

test("0154 adds parked and an append-only events table with wrapped RLS", () => {
  assert.ok(migration.includes("'parked'"));
  assert.ok(migration.includes("olb_roadmap_items_status_check"));
  assert.ok(migration.includes("create table if not exists public.olb_roadmap_events"));
  assert.ok(migration.includes("actor        text not null check (actor = 'bot')") || migration.includes("actor = 'bot'"));
  assert.ok(migration.includes("from_status"));
  assert.ok(migration.includes("to_status"));
  assert.ok(migration.includes("note"));
  assert.ok(migration.includes("created_at"));
  assert.ok(migration.includes("using ((select public.is_super_admin()))"));
  assert.ok(!migration.includes("using (public.is_super_admin())"));
  assert.ok(!migration.includes("olb_roadmap_events_insert"));
  assert.ok(!migration.includes("olb_roadmap_events_update"));
  assert.ok(!migration.includes("olb_roadmap_events_delete"));
  assert.ok(down.includes("drop table if exists public.olb_roadmap_events"));
});

test("PATCH still uses the same bot Bearer gate, writes history, and has no DELETE", () => {
  assert.ok(patch.includes("roadmapBotDeny"));
  assert.ok(patch.includes("botPatchEvent"));
  assert.ok(patch.includes("olb_roadmap_events"));
  assert.ok(patch.includes("cleanBotStatusPatch"));
  assert.ok(!/\bexport async function DELETE\b/.test(patch));
  assert.ok(!patch.includes("deleted_at:"));
  assert.ok(botHttp.includes("roadmapBotAuthorized"));
  assert.ok(botHttp.includes("ROADMAP_BOT_TOKEN_ENV"));
  assert.ok(!botHttp.includes("OLB_ROADMAP_BOT_TOKEN="));
  assert.ok(!/\bexport async function DELETE\b/.test(list));
  assert.ok(!/\bexport async function PATCH\b/.test(list));
});

test("the board shows Parked and card history", () => {
  assert.ok(model.includes('"parked"'));
  assert.ok(model.includes('label: "Parked"'));
  assert.ok(view.includes("History"));
  assert.ok(view.includes("formatRoadmapEvent"));
  assert.ok(view.includes("latest_note"));
  assert.ok(view.includes('s.key)'));
});
