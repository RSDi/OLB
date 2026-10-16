// Release notes migration (0138): numbering, RLS wrapping, seed of the 10/16
// releases, and a link to released roadmap items.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0138_release_notes.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0138_release_notes_down.sql"), "utf8");

test("0138 is the next numbered migration after 0137", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0137_hotel_stay_travel_players.sql"));
  assert.ok(names.includes("0138_release_notes.sql"));
  assert.equal(
    names.filter((n) => n.startsWith("0138")).length,
    1,
    "only one 0138 migration"
  );
  const last = names.filter((n) => /^\d{4}_/.test(n)).at(-1);
  assert.equal(last, "0138_release_notes.sql");
});

test("0138 wraps staff and super-admin helpers, and does not use bare calls", () => {
  assert.match(migration, /using \(\(select public\.is_staff\(\)\)\)/);
  assert.match(migration, /with check \(\(select public\.is_super_admin\(\)\) and created_by = \(select auth\.uid\(\)\)\)/);
  assert.match(migration, /using \(\(select public\.is_super_admin\(\)\)\)/);
  assert.doesNotMatch(migration, /using \(public\.is_staff\(\)\)/);
  assert.doesNotMatch(migration, /using \(public\.is_super_admin\(\)\)/);
  assert.doesNotMatch(migration, /using \(auth\.uid\(\)\)/);
  assert.ok(migration.includes("references public.olb_roadmap_items(id)"));
  assert.ok(migration.includes("olb_release_notes_roadmap_item_live"));
  assert.ok(migration.includes("jsonb_typeof(steps) = 'array'"));
  assert.ok(down.includes("drop table if exists public.olb_release_notes"));
});

test("0138 seeds the 10/16 releases with Show me how steps", () => {
  for (const key of [
    "2026-10-16-hotel-staying-elsewhere",
    "2026-10-16-hotel-covered-sibling",
    "2026-10-16-roadmap-preview",
    "2026-10-16-family-send-checkboxes",
  ]) {
    assert.ok(migration.includes(key), `missing seed ${key}`);
  }
  assert.ok(migration.includes("'2026-10-16'"));
  assert.ok(migration.includes("Staying elsewhere and sibling marking"));
  assert.ok(migration.includes("Covered via sibling, and Travel sees every player"));
  assert.ok(migration.includes("Roadmap Preview column"));
  assert.ok(migration.includes("Tick families off before you send"));
  assert.ok(migration.includes("'HS Schedule'"));
  assert.ok(migration.includes("'Portal'"));
  assert.ok(migration.includes("'Slack & email'"));
  assert.ok(migration.includes("Show me how"));
  assert.ok(migration.includes("/portal/directory"));
  assert.ok(migration.includes("/portal/roadmap"));
  assert.match(migration, /where not exists/i);
});
