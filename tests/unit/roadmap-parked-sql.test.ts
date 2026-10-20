// Roadmap Parked + bot notes (0154) and transactional bot PATCH (0155):
// parked is a status, history is append-only, move+log are one function
// with a 409 if the column changed, and PATCH still uses the same bot
// Bearer gate with no DELETE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0154_roadmap_parked_notes.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0154_roadmap_parked_notes_down.sql"), "utf8");
const patchSql = readFileSync(join(root, "supabase/migrations/0155_roadmap_bot_patch.sql"), "utf8");
const patchDown = readFileSync(join(root, "supabase/removal/0155_roadmap_bot_patch_down.sql"), "utf8");
const patch = readFileSync(join(root, "app/api/roadmap/items/[id]/route.ts"), "utf8");
const list = readFileSync(join(root, "app/api/roadmap/items/route.ts"), "utf8");
const botHttp = readFileSync(join(root, "lib/roadmap/bot-http.ts"), "utf8");
const view = readFileSync(join(root, "app/portal/roadmap/RoadmapView.tsx"), "utf8");
const model = readFileSync(join(root, "lib/roadmap/model.ts"), "utf8");

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} missing`);
  const as = sql.indexOf("as $$", start);
  const end = sql.indexOf("$$;", as + 1);
  assert.ok(as >= 0 && end > as, `${name} body missing`);
  return sql.slice(as, end);
}

test("0154 follows 0153 and 0155 follows 0154", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0153_planning_roles_invoicing_holder.sql"));
  assert.ok(names.includes("0154_roadmap_parked_notes.sql"));
  assert.ok(names.includes("0155_roadmap_bot_patch.sql"));
  assert.equal(names.filter((n) => n.startsWith("0154")).length, 1, "only one 0154 migration");
  assert.equal(names.filter((n) => n.startsWith("0155")).length, 1, "only one 0155 migration");
});

test("0154 adds parked and an append-only events table with wrapped RLS", () => {
  assert.ok(migration.includes("'parked'"));
  assert.ok(migration.includes("olb_roadmap_items_status_check"));
  assert.ok(migration.includes("create table if not exists public.olb_roadmap_events"));
  assert.ok(migration.includes("actor = 'bot'"));
  assert.ok(migration.includes("from_status"));
  assert.ok(migration.includes("to_status"));
  assert.ok(migration.includes("note"));
  assert.ok(migration.includes("created_at"));
  assert.ok(migration.includes("using ((select public.is_super_admin()))"));
  assert.ok(!migration.includes("using (public.is_super_admin())"));
  assert.ok(!migration.includes("olb_roadmap_events_insert"));
  assert.ok(!migration.includes("olb_roadmap_events_update"));
  assert.ok(!migration.includes("olb_roadmap_events_delete"));
});

test("0154 down moves Parked cards to Proposed and says it drops history", () => {
  assert.match(down, /status = 'proposed'/);
  assert.match(down, /where status = 'parked'/);
  assert.ok(down.includes("drop table if exists public.olb_roadmap_events"));
  assert.match(down, /DROPPED|drops history|bot history/i);
});

test("bot_patch_roadmap_item updates and logs in one function; a failed insert has no handler so the move rolls back", () => {
  const body = functionBody(patchSql, "bot_patch_roadmap_item");
  const updateAt = body.search(/update public\.olb_roadmap_items/i);
  const insertAt = body.search(/insert into public\.olb_roadmap_events/i);
  assert.ok(updateAt >= 0, "update missing");
  assert.ok(insertAt >= 0, "insert missing");
  assert.ok(updateAt < insertAt, "log insert must follow the card update in the same function");
  assert.match(body, /status = p_from_status/);
  assert.match(body, /raise exception 'conflict'/);
  assert.match(body, /errcode = 'P0001'/);
  assert.doesNotMatch(body, /exception when/i);
  assert.doesNotMatch(body, /when others/i);
  assert.ok(patchSql.includes("revoke all on function public.bot_patch_roadmap_item"));
  assert.ok(patchSql.includes("from public, anon, authenticated"));
  assert.ok(patchSql.includes("grant execute on function public.bot_patch_roadmap_item"));
  assert.ok(patchSql.includes("to service_role"));
  assert.ok(patchDown.includes("drop function if exists public.bot_patch_roadmap_item"));
});

test("PATCH still uses the same bot Bearer gate, writes through the RPC, and has no DELETE", () => {
  assert.ok(patch.includes("roadmapBotDeny"));
  assert.ok(patch.includes("BOT_PATCH_RPC"));
  assert.ok(patch.includes("botPatchRpcArgs"));
  assert.ok(patch.includes("botPatchNeedsLog"));
  assert.ok(patch.includes("botPatchIsNoop"));
  assert.ok(!patch.includes("olb_roadmap_events"));
  assert.ok(!/\.update\(row\)/.test(patch));
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
  assert.ok(view.includes("s.key)"));
});
