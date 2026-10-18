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

test("0145 is the next numbered migration after 0144", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  const playlists = readFileSync(join(root, "supabase/migrations/0145_game_film_youtube_playlists.sql"), "utf8");
  assert.ok(names.includes("0144_game_film_youtube.sql"));
  assert.ok(names.includes("0145_game_film_youtube_playlists.sql"));
  assert.equal(names.filter((n) => n.startsWith("0145")).length, 1, "only one 0145 migration");
  assert.ok(playlists.includes("add column if not exists youtube_playlist_id"));
  assert.ok(playlists.includes("youtube_playlist_status"));
  assert.ok(playlists.includes("check (youtube_playlist_status in ('queued', 'done', 'failed'))"));
  assert.ok(playlists.includes("youtube_playlist_error"));
  assert.ok(playlists.includes("youtube_playlist_item_id"));
  assert.ok(playlists.includes("game_film_uploads_youtube_playlist_status_idx"));
  assert.ok(playlists.includes("alter table public.olb_teams"));
  assert.ok(playlists.includes("OLB does NOT auto-run"));
  assert.ok(!playlists.includes("drop table"));
  assert.ok(!playlists.includes("to anon"));
});

test("0144 is the next numbered migration after 0143", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  const youtube = readFileSync(join(root, "supabase/migrations/0144_game_film_youtube.sql"), "utf8");
  assert.ok(names.includes("0143_game_film_game.sql"));
  assert.ok(names.includes("0144_game_film_youtube.sql"));
  assert.equal(names.filter((n) => n.startsWith("0144")).length, 1, "only one 0144 migration");
  assert.ok(youtube.includes("create table if not exists public.game_film_youtube"));
  assert.ok(youtube.includes("create table if not exists public.game_film_youtube_jobs"));
  assert.ok(youtube.includes("add column if not exists youtube_status"));
  assert.ok(youtube.includes("refresh_token_enc"));
  assert.ok(youtube.includes("revoke all on table public.game_film_youtube"));
  assert.ok(youtube.includes("revoke all on table public.game_film_youtube_jobs"));
  assert.ok(youtube.includes("OLB does NOT auto-run"));
  assert.ok(!youtube.includes("to anon"));
  assert.ok(!youtube.includes("drop table"));
});

test("0148 adds per-team YouTube templates, extras, Slack drafts, and lineups", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  const sql = readFileSync(join(root, "supabase/migrations/0148_game_film_youtube_templates.sql"), "utf8");
  const down = readFileSync(join(root, "supabase/removal/0148_game_film_youtube_templates_down.sql"), "utf8");
  assert.ok(names.includes("0145_game_film_youtube_playlists.sql"));
  assert.ok(names.includes("0148_game_film_youtube_templates.sql"));
  assert.ok(names.includes("0150_hosted_tournaments.sql"));
  assert.equal(names.filter((n) => n.startsWith("0148")).length, 1, "only one 0148 migration");
  assert.ok(names.includes("0146_agent_keys.sql"));
  assert.equal(names.filter((n) => n.startsWith("0146")).length, 1, "0146 is agent keys from #208");
  assert.match(sql, /after 0147/);
  assert.ok(sql.includes("film_youtube_title_template"));
  assert.ok(sql.includes("film_youtube_description_template"));
  assert.ok(sql.includes("film_include_stats_book boolean not null default false"));
  assert.ok(sql.includes("film_include_players boolean not null default false"));
  assert.ok(sql.includes("film_include_tournament boolean not null default false"));
  assert.ok(sql.includes("film_include_playlist_link boolean not null default false"));
  assert.ok(sql.includes("film_slack_channel_id"));
  assert.ok(sql.includes("create table if not exists public.game_film_slack_drafts"));
  assert.ok(sql.includes("check (status in ('pending', 'posting', 'posted', 'discarded'))"));
  assert.ok(sql.includes("discarded_at"));
  assert.ok(sql.includes("create table if not exists public.game_film_lineups"));
  assert.ok(sql.includes("create table if not exists public.game_film_lineup_players"));
  assert.ok(sql.includes("(select public.can_view_film())"));
  assert.ok(sql.includes("(select public.can_manage_teams())"));
  assert.ok(sql.includes("user_id = (select auth.uid())"));
  assert.ok(sql.includes("OLB does NOT auto-run"));
  assert.ok(!sql.includes("drop table"));
  assert.ok(!sql.includes("to anon"));
  assert.ok(!sql.includes("using (public.can_view_film())"));
  assert.ok(down.includes("drop table if exists public.game_film_slack_drafts"));
  assert.ok(down.includes("drop table if exists public.game_film_lineups"));
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
