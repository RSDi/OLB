import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0146_agent_keys.sql"), "utf8");

test("0146 is reserved for agent keys (0149 email-archive, 0150 already on main)", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0145_game_film_youtube_playlists.sql"));
  assert.ok(names.includes("0146_agent_keys.sql"));
  assert.ok(names.includes("0150_hosted_tournaments.sql"));
  assert.equal(names.filter((n) => n.startsWith("0146")).length, 1, "only one 0146 migration");
  assert.equal(names.filter((n) => n.startsWith("0149")).length, 0, "0149 is reserved for email-archive");
});

test("0146 has a removal script outside migrations", () => {
  const down = readFileSync(join(root, "supabase/removal/0146_agent_keys_down.sql"), "utf8");
  assert.ok(down.includes("drop table if exists public.olb_agent_keys"));
  assert.ok(down.includes("Kept outside"));
  assert.ok(!down.includes("to anon"));
});

test("0146 stores hashed agent keys, service-role only", () => {
  assert.ok(migration.includes("create table if not exists public.olb_agent_keys"));
  assert.ok(migration.includes("key_hash"));
  assert.ok(migration.includes("key_prefix"));
  assert.ok(migration.includes("revoked_at"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(migration.includes("revoke all on table public.olb_agent_keys from public, anon, authenticated"));
  assert.ok(migration.includes("OLB does NOT auto-run"));
  assert.ok(!migration.includes("to anon"));
  assert.ok(!migration.includes("drop table"));
  assert.ok(!migration.includes("grant select"));
  assert.ok(!migration.includes("using (public.is_staff())"));
});
