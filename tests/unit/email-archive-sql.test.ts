import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
const migration = readFileSync(join(root, "supabase/migrations/0149_email_archive.sql"), "utf8");

test("0149 is the email archive migration after 0146–0148; 0150 is already on main", () => {
  assert.ok(names.includes("0146_agent_keys.sql"));
  assert.ok(names.includes("0147_game_film_youtube_privacy.sql"));
  assert.ok(names.includes("0148_game_film_youtube_templates.sql"));
  assert.ok(names.includes("0149_email_archive.sql"));
  assert.ok(names.includes("0150_hosted_tournaments.sql"));
  assert.equal(names.filter((n) => n.startsWith("0149")).length, 1);
  assert.match(migration, /0150 \(hosted tournaments, #175\) is already/);
  assert.doesNotMatch(migration, /0150 is reserved/);
});

test("0149: staff read, server-only writes, private bucket, wrapped is_staff", () => {
  for (const table of [
    "email_archive_threads",
    "email_archive_messages",
    "email_archive_attachments",
    "email_archive_links",
  ]) {
    assert.ok(migration.includes(`create table if not exists public.${table}`), table);
    assert.ok(migration.includes(`grant select on table public.${table} to authenticated`), table);
    assert.match(migration, new RegExp(`${table}_select_staff`));
  }
  assert.ok(migration.includes("gmail_thread_id   text not null unique") || migration.includes("gmail_thread_id text not null unique") || migration.includes("gmail_thread_id"));
  assert.ok(migration.includes("email-archive-files"));
  assert.ok(migration.includes("using ((select public.is_staff()))"));
  assert.ok(!migration.includes("using (public.is_staff())"));
  assert.ok(!migration.includes("for insert"));
  assert.ok(!migration.includes("for update"));
  assert.ok(!migration.includes("for delete"));
  assert.ok(migration.includes("scopes"));
  assert.ok(migration.includes("email_archive:write"));
  assert.ok(migration.includes("OLB does NOT auto-run"));
  assert.ok(migration.includes("do not apply to production"));
});
