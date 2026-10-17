import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0142_game_film.sql"), "utf8");
const gameMeta = readFileSync(join(root, "supabase/migrations/0143_game_film_game.sql"), "utf8");

test("0142 is the next numbered migration after 0141", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0141_device_pairings.sql"));
  assert.ok(names.includes("0142_game_film.sql"));
  assert.equal(names.filter((n) => n.startsWith("0142")).length, 1, "only one 0142 migration");
});

test("0143 is the next numbered migration after 0142", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0142_game_film.sql"));
  assert.ok(names.includes("0143_game_film_game.sql"));
  assert.equal(names.filter((n) => n.startsWith("0143")).length, 1, "only one 0143 migration");
});

test("0143 adds game date, opponent, and optional score columns", () => {
  assert.ok(gameMeta.includes("add column if not exists game_date date"));
  assert.ok(gameMeta.includes("add column if not exists opponent text"));
  assert.ok(gameMeta.includes("add column if not exists our_score integer"));
  assert.ok(gameMeta.includes("add column if not exists their_score integer"));
  assert.ok(gameMeta.includes("game_film_uploads_game_date_idx"));
  assert.ok(gameMeta.includes("OLB does NOT auto-run"));
  assert.ok(!gameMeta.includes("drop table"));
  assert.ok(!gameMeta.includes("to anon"));
});

test("0142 adds game_film_uploads, the private bucket, and wrapped film helpers", () => {
  assert.ok(migration.includes("create table if not exists public.game_film_uploads"));
  assert.ok(migration.includes("status        text not null default 'holding'"));
  assert.ok(migration.includes("check (status in ('holding', 'moved'))"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("game-film"));
  assert.ok(migration.includes("21474836480"));
  assert.ok(migration.includes("can_view_film"));
  assert.ok(migration.includes("can_manage_film"));
  assert.ok(migration.includes("has_permission('film_view')"));
  assert.ok(migration.includes("has_permission('film_manage')"));
  assert.ok(migration.includes("(select public.can_view_film())"));
  assert.ok(migration.includes("using ((select public.can_manage_film()))"));
  assert.ok(migration.includes("film_slug"));
  assert.ok(migration.includes("film_code_hash"));
  assert.ok(migration.includes("film_code_version"));
  assert.ok(migration.includes("game_film_managers"));
  assert.ok(!migration.includes("using (public.can_view_film())"));
  assert.ok(!migration.includes("using (public.is_staff())"));
  assert.ok(!migration.includes("TEAM_CODE_"));
  assert.ok(!migration.includes("drop table"));
  assert.ok(!migration.includes("to anon"));
  assert.ok(migration.includes("OLB does NOT auto-run"));
});
