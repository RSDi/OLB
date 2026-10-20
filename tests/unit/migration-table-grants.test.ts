// New public tables need an explicit GRANT for the Data API (supabase-js /
// PostgREST). Supabase stops auto-granting new public tables on 2026-10-30.
//
// 0154 backfills tables that never got a grant in their creating file.
// Migrations after 0154 that `create table public.x` without granting on
// public.x fail here (and in CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migrationsDir = join(root, "supabase/migrations");
const CUTOFF = "0154_data_api_table_grants.sql";
const DATA_API_ROLES = ["anon", "authenticated", "service_role"] as const;

const SERVICE_ROLE_ONLY = [
  "device_pairings",
  "game_film_youtube",
  "game_film_youtube_events",
  "game_film_youtube_jobs",
  "member_slack_connections",
  "olb_agent_keys",
  "olb_registration_codes",
  "public_directory_link",
] as const;

function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function createdPublicTables(sql: string): string[] {
  const tables: string[] = [];
  const re = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) tables.push(m[1]);
  return tables;
}

/** table name → roles named in GRANT … ON that table … TO … */
function tableGrants(sql: string): Map<string, Set<string>> {
  const granted = new Map<string, Set<string>>();
  const re = /\bgrant\s+(?!execute\b)([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const stmt = m[1];
    if (/\bon\s+(function|sequence|schema|all\s+functions|all\s+sequences)\b/i.test(stmt)) continue;
    const parts = stmt.match(/\bon\s+(?:table\s+)?([\s\S]+?)\s+to\s+([\s\S]+)$/i);
    if (!parts) continue;
    const roles = [...parts[2].matchAll(/\b(anon|authenticated|service_role|postgres|public)\b/gi)].map((r) =>
      r[1].toLowerCase(),
    );
    for (const t of parts[1].matchAll(/public\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) {
      if (!granted.has(t[1])) granted.set(t[1], new Set());
      for (const role of roles) granted.get(t[1])!.add(role);
    }
  }
  return granted;
}

function ungrantedPublicTables(sql: string): string[] {
  const granted = tableGrants(sql);
  return createdPublicTables(sql).filter((t) => {
    const roles = granted.get(t);
    if (!roles) return true;
    return !DATA_API_ROLES.some((r) => roles.has(r));
  });
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort();
}

function migrationNumber(name: string): number {
  const m = name.match(/^(\d{4})_/);
  assert.ok(m, `migration filename must start with four digits: ${name}`);
  return Number(m[1]);
}

test("parser ignores comments and requires a Data API grant on each created public table", () => {
  const sql = `
    -- create table if not exists public.commented (id uuid);
    create table if not exists public.foo (id uuid);
    create table if not exists public.bar (id uuid);
    grant execute on function public.foo() to authenticated;
    grant select, insert, update, delete on public.foo to authenticated, service_role;
  `;
  assert.deepEqual(createdPublicTables(stripSqlComments(sql)), ["foo", "bar"]);
  assert.deepEqual(ungrantedPublicTables(stripSqlComments(sql)), ["bar"]);
});

test("parser accepts a multi-table GRANT and service_role-only", () => {
  const sql = `
    create table if not exists public.a (id uuid);
    create table if not exists public.b (id uuid);
    grant select, insert, update, delete on public.a, public.b to service_role;
  `;
  assert.deepEqual(ungrantedPublicTables(stripSqlComments(sql)), []);
  assert.ok(tableGrants(stripSqlComments(sql)).get("b")?.has("service_role"));
});

test("0154 is the next numbered migration after 0153", () => {
  const names = migrationFiles();
  assert.ok(names.includes("0153_planning_roles_invoicing_holder.sql"));
  assert.ok(names.includes(CUTOFF));
  assert.equal(names.filter((n) => n.startsWith("0154")).length, 1, "only one 0154 migration");
  assert.equal(migrationNumber(CUTOFF), 154);
});

test("0154 grants every post-baseline public table that lacked a table GRANT", () => {
  const names = migrationFiles();
  const cutoffNum = migrationNumber(CUTOFF);
  const grantedBefore = new Set<string>();
  const createdBefore: string[] = [];
  for (const name of names) {
    const n = migrationNumber(name);
    if (n === 0 || n >= cutoffNum) continue;
    const sql = stripSqlComments(readFileSync(join(migrationsDir, name), "utf8"));
    createdBefore.push(...createdPublicTables(sql));
    for (const table of tableGrants(sql).keys()) grantedBefore.add(table);
  }
  const missing = [...new Set(createdBefore)].filter((t) => !grantedBefore.has(t)).sort();
  const backfill = stripSqlComments(readFileSync(join(migrationsDir, CUTOFF), "utf8"));
  const grantedNow = tableGrants(backfill);
  const stillMissing = missing.filter((t) => {
    const roles = grantedNow.get(t);
    return !roles || !DATA_API_ROLES.some((r) => roles.has(r));
  });
  assert.deepEqual(stillMissing, [], "0154 must GRANT every public table created before it that had no table grant");

  for (const table of SERVICE_ROLE_ONLY) {
    const roles = grantedNow.get(table);
    assert.ok(roles?.has("service_role"), `${table} needs service_role`);
    assert.ok(!roles?.has("authenticated"), `${table} is service-role only`);
    assert.ok(!roles?.has("anon"), `${table} is service-role only`);
  }

  const authTables = missing.filter((t) => !SERVICE_ROLE_ONLY.includes(t as (typeof SERVICE_ROLE_ONLY)[number]));
  for (const table of authTables) {
    const roles = grantedNow.get(table);
    assert.ok(roles?.has("authenticated"), `${table} needs authenticated`);
    assert.ok(roles?.has("service_role"), `${table} needs service_role`);
    assert.ok(!roles?.has("anon"), `${table} does not need anon`);
  }
});

test("0154 does not change RLS, default privileges, or grant anon", () => {
  const sql = readFileSync(join(migrationsDir, CUTOFF), "utf8");
  assert.ok(sql.includes("grant select, insert, update, delete on"));
  assert.ok(sql.includes("to authenticated, service_role"));
  assert.ok(sql.includes("to service_role"));
  assert.ok(!/\bgrant\b[^;]*\bto anon\b/i.test(stripSqlComments(sql)));
  assert.ok(!sql.includes("alter default privileges"));
  assert.ok(!sql.includes("create policy"));
  assert.ok(!sql.includes("enable row level security"));
  assert.ok(!sql.includes("drop table"));
  assert.ok(!sql.includes("drop policy"));
  assert.match(sql, /after 0153/);
});

test("migrations after 0154 that create a public table include a matching grant", () => {
  const names = migrationFiles();
  const cutoffNum = migrationNumber(CUTOFF);
  const failures: string[] = [];
  for (const name of names) {
    if (migrationNumber(name) <= cutoffNum) continue;
    const sql = stripSqlComments(readFileSync(join(migrationsDir, name), "utf8"));
    for (const table of ungrantedPublicTables(sql)) {
      failures.push(
        `${name} creates public.${table} without grant … on public.${table} to authenticated, service_role (or service_role only / anon select when that is the access)`,
      );
    }
  }
  assert.deepEqual(failures, []);
});
