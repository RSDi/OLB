// Release notes migration (0138): a seen-marker column on members. The notes
// themselves live in lib/release-notes/releases.ts, not a table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0138_release_notes.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0138_release_notes_down.sql"), "utf8");
const releases = readFileSync(join(root, "lib/release-notes/releases.ts"), "utf8");

test("0138 is the numbered migration after 0137", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0137_hotel_stay_travel_players.sql"));
  assert.ok(names.includes("0138_release_notes.sql"));
  assert.equal(
    names.filter((n) => n.startsWith("0138")).length,
    1,
    "only one 0138 migration"
  );
});

test("0138 adds members.releases_seen_version and does not create a notes table", () => {
  assert.match(migration, /alter table public\.members/i);
  assert.match(migration, /add column if not exists releases_seen_version text/i);
  assert.doesNotMatch(migration, /create table/i);
  assert.doesNotMatch(migration, /olb_release_notes/);
  assert.doesNotMatch(migration, /using \(public\.is_staff\(\)\)/);
  assert.doesNotMatch(migration, /using \(public\.is_super_admin\(\)\)/);
  assert.doesNotMatch(migration, /using \(auth\.uid\(\)\)/);
  assert.ok(down.includes("drop column if exists releases_seen_version"));
  assert.doesNotMatch(down, /drop table/i);
});

test("the 10/16 seed entries live in releases.ts, not the migration", () => {
  for (const title of [
    "Tick families off before you send",
    "Roadmap Preview column",
    "Covered via sibling, and Travel sees every player",
    "Staying elsewhere and sibling marking",
  ]) {
    assert.ok(releases.includes(title), `missing seed "${title}"`);
    assert.ok(!migration.includes(title), `migration should not seed "${title}"`);
  }
  assert.ok(releases.includes('version: "26.10.0"'));
  assert.ok(releases.includes("October 16, 2026"));
});
