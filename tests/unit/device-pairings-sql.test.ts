import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0141_device_pairings.sql"), "utf8");

test("0141 is the next numbered migration after 0140", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0140_age_eligibility.sql"));
  assert.ok(names.includes("0141_device_pairings.sql"));
  assert.equal(names.filter((n) => n.startsWith("0141")).length, 1, "only one 0141 migration");
});

test("0141 adds device_pairings with RLS and no open policies", () => {
  assert.ok(migration.includes("create table if not exists public.device_pairings"));
  assert.ok(migration.includes("secret_hash"));
  assert.ok(migration.includes("user_code_hmac"));
  assert.ok(migration.includes("session_expires_at"));
  assert.ok(migration.includes("enable row level security"));
  assert.ok(!migration.includes("create policy"));
  assert.ok(!migration.includes("drop table"));
  assert.ok(!migration.includes("drop column"));
  assert.ok(!migration.includes("using (public.is_staff())"));
  assert.ok(!migration.includes("using (public.is_super_admin())"));
  assert.ok(!migration.includes("grant all"));
  assert.ok(!migration.includes("to anon"));
  assert.ok(!migration.includes("to authenticated"));
});
