// Hotel stay Travel access (0136) and the sibling-mark backfill (manual).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0136_hotel_stay_travel_players.sql"), "utf8");
const backfill = readFileSync(join(root, "supabase/manual/hotel_sibling_backfill.sql"), "utf8");

test("0136 is the next numbered migration and is not under supabase/manual", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0136_hotel_stay_travel_players.sql"));
  assert.equal(
    names.filter((n) => n.startsWith("0136")).length,
    1,
    "only one 0136 migration"
  );
  const manuals = readdirSync(join(root, "supabase/manual"));
  assert.ok(!manuals.some((n) => n.startsWith("0136")));
});

test("0136 scopes hotel-stay player reads to the Travel grant, not the general directory", () => {
  assert.ok(migration.includes("can_see_hotel_stay_players"));
  assert.ok(migration.includes("can_manage_travel()"));
  assert.ok(migration.includes("hotel_stay_season_players"));
  assert.ok(migration.includes("security definer"));
  assert.ok(migration.includes("olb_players_travel_hotel_select"));
  assert.ok(migration.includes("(select public.can_see_hotel_stay_players())"));
  assert.ok(migration.includes("hotel_stay_season_board_id"));
  assert.ok(!migration.includes("drop policy if exists \"olb_players_directory_select\""));
  assert.ok(!migration.includes("create or replace function public.can_see_all_players"));
  assert.match(migration, /revoke all on function public\.hotel_stay_season_players\(\)/);
});

test("the sibling picker loads current-season players through the Travel RPC", () => {
  const data = readFileSync(join(root, "lib/hs-hotel-stays/data.ts"), "utf8");
  assert.ok(data.includes('rpc("hotel_stay_season_players")'));
  assert.ok(data.includes("loadHotelStaySeasonPlayers"));
  assert.ok(data.includes("loadStaySiblingPlayers"));
  const list = readFileSync(join(root, "app/portal/directory/PlayersList.tsx"), "utf8");
  assert.ok(list.includes("countStayStates"));
  assert.ok(list.includes("stayPlayers"));
  assert.ok(list.includes("stayCoveredWord"));
});

test("sibling backfill is a preview transaction that rolls back unless Jeff commits", () => {
  assert.match(backfill, /^begin;/m);
  assert.match(backfill, /Copied from sibling: /);
  assert.match(backfill, /olb_player_parents/);
  assert.match(backfill, /state in \('done','waived'\)/);
  assert.match(backfill, /m\.state = 'missing'/);
  assert.ok(backfill.includes("rows_to_insert"));
  assert.ok(backfill.includes("stay_player_rows_before"));
  assert.ok(backfill.includes("stay_player_rows_after"));
  assert.ok(backfill.includes("insert into public.hs_hotel_stay_players"));
  assert.ok(backfill.includes("Jeff: change ROLLBACK to COMMIT"));
  assert.match(backfill, /rollback;\s*$/i);
  assert.doesNotMatch(backfill, /^\s*commit;/im);
});
