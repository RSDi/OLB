import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0140_age_eligibility.sql"), "utf8");

test("0140 is the next numbered migration after 0139", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0138_release_notes.sql"));
  assert.ok(names.includes("0139_roadmap_approve.sql"));
  assert.ok(names.includes("0140_age_eligibility.sql"));
  assert.equal(names.filter((n) => n.startsWith("0140")).length, 1, "only one 0140 migration");
});

test("0140 adds season_ends_on, staff setter, and staff-only age caps", () => {
  assert.ok(migration.includes("season_ends_on date"));
  assert.ok(migration.includes("2026-12-31"));
  assert.ok(migration.includes("set_season_ends_on"));
  assert.ok(migration.includes("if not public.is_staff()"));
  assert.ok(migration.includes("create table if not exists public.olb_age_caps"));
  assert.ok(migration.includes("('14U', 14, 30)"));
  assert.ok(migration.includes("('12U', 12, 20)"));
  assert.ok(migration.includes("('10U', 10, 10)"));
  assert.ok(migration.includes("using ((select public.is_staff()))"));
  assert.ok(migration.includes("with check ((select public.is_staff()))"));
  assert.ok(!migration.includes("using (public.is_staff())"));
  assert.ok(!migration.includes("with check (public.is_staff())"));
  assert.ok(!migration.includes("using (public.is_super_admin())"));
});

test("the Directory and Settings wire eligibility through staff-only loaders", () => {
  const list = readFileSync(join(root, "app/portal/directory/PlayersList.tsx"), "utf8");
  const page = readFileSync(join(root, "app/portal/directory/page.tsx"), "utf8");
  const settings = readFileSync(join(root, "app/portal/settings/page.tsx"), "utf8");
  const tab = readFileSync(join(root, "app/portal/settings/SeasonTab.tsx"), "utf8");
  const actions = readFileSync(join(root, "lib/teams/eligibility-actions.ts"), "utf8");
  assert.ok(page.includes("loadEligibilityContext"));
  assert.ok(page.includes("canSeeBirthdates={viewer.isStaff}"));
  assert.ok(list.includes("Available to swing up"));
  assert.ok(list.includes("agesOutLabel"));
  assert.ok(settings.includes('"season"'));
  assert.ok(settings.includes("SeasonTab"));
  assert.ok(tab.includes("Season end date"));
  assert.ok(tab.includes("Age caps by level"));
  assert.ok(actions.includes("requireStaff"));
  assert.ok(actions.includes('rpc("set_season_ends_on"'));
});
