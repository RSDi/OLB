// New public tables, sequences, and functions need an explicit GRANT for
// the Data API (supabase-js / PostgREST). Supabase stops auto-granting new
// public objects on 2026-10-30.
//
// The *_data_api_table_grants.sql migration backfills tables that never
// got a grant in their creating file. Migrations numbered 0154 and later
// that create a public table, sequence, or function without a matching
// grant fail here (and in CI), so #215/#219 must carry their own grants.
// Sequence and function grants must name anon, authenticated, or
// service_role. Trigger functions are exempt. serial / identity columns
// flag their implicit <table>_<column>_seq. The backfill filename is
// discovered by suffix so it can be renumbered without editing this test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const migrationsDir = join(root, "supabase/migrations");
const DATA_API_ROLES = ["anon", "authenticated", "service_role"] as const;
/** Per-file CREATE TABLE/SEQUENCE/FUNCTION must include a matching GRANT. */
const CHECK_FROM = 154;

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

function createdPublicSequences(sql: string): string[] {
  const seqs: string[] = [];
  const re = /\bcreate\s+(?:unlogged\s+)?sequence\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) seqs.push(m[1]);
  return seqs;
}

function extractParenBlock(sql: string, openIndex: number): string | null {
  if (sql[openIndex] !== "(") return null;
  let depth = 0;
  for (let i = openIndex; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) return sql.slice(openIndex + 1, i);
    }
  }
  return null;
}

function serialColumnNames(body: string): string[] {
  const cols: string[] = [];
  const serialRe =
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(smallserial|serial8|serial4|bigserial|serial)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = serialRe.exec(body))) cols.push(m[1]);
  const identRe =
    /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:smallint|int2|integer|int4|int|bigint|int8)\s+generated\s+(?:always|by\s+default)\s+as\s+identity\b/gi;
  while ((m = identRe.exec(body))) cols.push(m[1]);
  return cols;
}

/** Implicit <table>_<column>_seq from serial / identity columns. */
function implicitSerialSequences(sql: string): string[] {
  const seqs: string[] = [];
  const createRe = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(sql))) {
    const table = m[1];
    const after = sql.slice(m.index + m[0].length).replace(/^\s+/, "");
    if (!after.startsWith("(")) continue;
    const body = extractParenBlock(after, 0);
    if (!body) continue;
    for (const col of serialColumnNames(body)) seqs.push(`${table}_${col}_seq`);
  }
  const alterSerialRe =
    /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+(smallserial|serial8|serial4|bigserial|serial)\b/gi;
  while ((m = alterSerialRe.exec(sql))) seqs.push(`${m[1]}_${m[2]}_seq`);
  const alterIdentRe =
    /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?public\.([a-zA-Z_][a-zA-Z0-9_]*)\s+add\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:smallint|int2|integer|int4|int|bigint|int8)\s+generated\s+(?:always|by\s+default)\s+as\s+identity\b/gi;
  while ((m = alterIdentRe.exec(sql))) seqs.push(`${m[1]}_${m[2]}_seq`);
  return seqs;
}

function createdPublicFunctions(sql: string): { name: string; returnsTrigger: boolean }[] {
  const fns: { name: string; returnsTrigger: boolean }[] = [];
  const re = /\bcreate\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const rest = sql.slice(m.index);
    const headerEnd = rest.search(/\bas\s+\$[a-zA-Z0-9_]*\$/i);
    const header = headerEnd >= 0 ? rest.slice(0, headerEnd) : rest.slice(0, 800);
    fns.push({ name: m[1], returnsTrigger: /\breturns\s+trigger\b/i.test(header) });
  }
  return fns;
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

function dataApiRoles(toClause: string): string[] {
  return [...toClause.matchAll(/\b(anon|authenticated|service_role)\b/gi)].map((r) => r[1].toLowerCase());
}

function addRoles(map: Map<string, Set<string>>, name: string, roles: string[]) {
  if (!map.has(name)) map.set(name, new Set());
  for (const role of roles) map.get(name)!.add(role);
}

/** GRANT … ON SEQUENCE/FUNCTION … TO anon|authenticated|service_role. */
function objectGrants(
  sql: string,
  kind: "sequence" | "function",
): { all: Set<string>; named: Map<string, Set<string>> } {
  const all = new Set<string>();
  const named = new Map<string, Set<string>>();
  const re = /\bgrant\s+([^;]+);/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const stmt = m[1];
    const parts = stmt.match(/^([\s\S]+?)\s+to\s+([\s\S]+)$/i);
    if (!parts) continue;
    const roles = dataApiRoles(parts[2]);
    if (roles.length === 0) continue;
    const target = parts[1];
    if (kind === "sequence") {
      if (/\bon\s+all\s+sequences\s+in\s+schema\s+public\b/i.test(target)) {
        for (const role of roles) all.add(role);
        continue;
      }
      for (const t of target.matchAll(/\bsequence\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
        addRoles(named, t[1], roles);
      }
    } else {
      if (/\bon\s+all\s+functions\s+in\s+schema\s+public\b/i.test(target)) {
        for (const role of roles) all.add(role);
        continue;
      }
      for (const t of target.matchAll(/\bfunction\s+public\.([a-zA-Z_][a-zA-Z0-9_]*)/gi)) {
        addRoles(named, t[1], roles);
      }
    }
  }
  return { all, named };
}

function hasDataApiGrant(
  grants: { all: Set<string>; named: Map<string, Set<string>> },
  name: string,
): boolean {
  if ([...grants.all].some((r) => (DATA_API_ROLES as readonly string[]).includes(r))) return true;
  const roles = grants.named.get(name);
  return !!roles && [...roles].some((r) => (DATA_API_ROLES as readonly string[]).includes(r));
}

function ungrantedPublicTables(sql: string): string[] {
  const granted = tableGrants(sql);
  return createdPublicTables(sql).filter((t) => {
    const roles = granted.get(t);
    if (!roles) return true;
    return !DATA_API_ROLES.some((r) => roles.has(r));
  });
}

function ungrantedPublicSequences(sql: string): string[] {
  const grants = objectGrants(sql, "sequence");
  const names = [...new Set([...createdPublicSequences(sql), ...implicitSerialSequences(sql)])];
  return names.filter((s) => !hasDataApiGrant(grants, s));
}

function ungrantedPublicFunctions(sql: string): string[] {
  const grants = objectGrants(sql, "function");
  return createdPublicFunctions(sql)
    .filter((f) => !f.returnsTrigger)
    .map((f) => f.name)
    .filter((name) => !hasDataApiGrant(grants, name));
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort();
}

function migrationNumber(name: string): number {
  const m = name.match(/^(\d{4})_/);
  assert.ok(m, `migration filename must start with four digits: ${name}`);
  return Number(m[1]);
}

function cutoffFile(): string {
  const found = migrationFiles().filter((n) => n.endsWith("_data_api_table_grants.sql"));
  assert.equal(found.length, 1, "exactly one *_data_api_table_grants.sql migration");
  return found[0];
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

test("parser requires usage on new sequences and execute on new functions to a Data API role", () => {
  const missing = stripSqlComments(`
    create sequence if not exists public.foo_seq;
    create or replace function public.bar() returns void language sql as $$ select 1 $$;
  `);
  assert.deepEqual(ungrantedPublicSequences(missing), ["foo_seq"]);
  assert.deepEqual(ungrantedPublicFunctions(missing), ["bar"]);

  const toPostgres = stripSqlComments(`
    create sequence if not exists public.foo_seq;
    create or replace function public.bar() returns void language sql as $$ select 1 $$;
    grant usage, select on sequence public.foo_seq to postgres;
    grant execute on function public.bar() to postgres;
  `);
  assert.deepEqual(ungrantedPublicSequences(toPostgres), ["foo_seq"]);
  assert.deepEqual(ungrantedPublicFunctions(toPostgres), ["bar"]);

  const granted = stripSqlComments(`
    create sequence if not exists public.foo_seq;
    create or replace function public.bar() returns void language sql as $$ select 1 $$;
    grant usage, select on sequence public.foo_seq to authenticated, service_role;
    grant execute on function public.bar() to authenticated, service_role;
  `);
  assert.deepEqual(ungrantedPublicSequences(granted), []);
  assert.deepEqual(ungrantedPublicFunctions(granted), []);
});

test("parser exempts RETURNS trigger functions from execute grants", () => {
  const sql = stripSqlComments(`
    create function public.keep_updated_at() returns trigger
      language plpgsql as $$ begin return new; end $$;
    create or replace function public.bar() returns void language sql as $$ select 1 $$;
    create function public.tagged_trg() returns trigger language plpgsql as $function$
      begin return new; end
    $function$;
  `);
  assert.deepEqual(ungrantedPublicFunctions(sql), ["bar"]);
  assert.ok(createdPublicFunctions(sql).some((f) => f.name === "keep_updated_at" && f.returnsTrigger));
  assert.ok(createdPublicFunctions(sql).some((f) => f.name === "tagged_trg" && f.returnsTrigger));
});

test("parser flags serial and identity columns' implicit sequences", () => {
  const serial = stripSqlComments(`
    create table if not exists public.foo (
      id serial primary key,
      name text
    );
  `);
  assert.deepEqual(ungrantedPublicSequences(serial), ["foo_id_seq"]);

  const identity = stripSqlComments(`
    create table if not exists public.bar (
      id bigint generated always as identity primary key
    );
    grant usage, select on sequence public.bar_id_seq to service_role;
  `);
  assert.deepEqual(ungrantedPublicSequences(identity), []);

  const alter = stripSqlComments(`
    alter table public.baz add column n bigserial;
  `);
  assert.deepEqual(ungrantedPublicSequences(alter), ["baz_n_seq"]);

  const alterNoColumnKw = stripSqlComments(`
    alter table public.baz add n serial;
    grant usage, select on all sequences in schema public to authenticated;
  `);
  assert.deepEqual(ungrantedPublicSequences(alterNoColumnKw), []);
});

test("cutoff is the *_data_api_table_grants.sql file; its number comes from the name", () => {
  const cutoff = cutoffFile();
  assert.match(cutoff, /^\d{4}_data_api_table_grants\.sql$/);
  assert.ok(migrationNumber(cutoff) > 153, "sits after 0153 already on main");
  assert.ok(
    migrationNumber(cutoff) >= 156,
    "0154/0155 are taken by open PRs #215 and #219",
  );
});

test("grant backfill covers every post-baseline public table that lacked a table GRANT", () => {
  const names = migrationFiles();
  const cutoff = cutoffFile();
  const cutoffNum = migrationNumber(cutoff);
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
  const backfill = stripSqlComments(readFileSync(join(migrationsDir, cutoff), "utf8"));
  const grantedNow = tableGrants(backfill);
  const stillMissing = missing.filter((t) => {
    const roles = grantedNow.get(t);
    return !roles || !DATA_API_ROLES.some((r) => roles.has(r));
  });
  assert.deepEqual(stillMissing, [], `${cutoff} must GRANT every public table created before it that had no table grant`);

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

test("grant backfill does not change RLS, default privileges, or grant anon", () => {
  const cutoff = cutoffFile();
  const sql = readFileSync(join(migrationsDir, cutoff), "utf8");
  assert.ok(sql.includes("grant select, insert, update, delete on"));
  assert.ok(sql.includes("to authenticated, service_role"));
  assert.ok(sql.includes("to service_role"));
  assert.ok(!/\bgrant\b[^;]*\bto anon\b/i.test(stripSqlComments(sql)));
  assert.ok(!sql.includes("alter default privileges"));
  assert.ok(!sql.includes("create policy"));
  assert.ok(!sql.includes("enable row level security"));
  assert.ok(!sql.includes("drop table"));
  assert.ok(!sql.includes("drop policy"));
  assert.match(sql, /Apply with supabase db push/);
});

test("grant backfill IF EXISTS-grants inv_gmail and olb_roadmap_events from open PRs", () => {
  const sql = readFileSync(join(migrationsDir, cutoffFile()), "utf8");
  assert.match(sql, /if exists \(/);
  assert.match(sql, /c\.relname = 'inv_gmail'/);
  assert.match(sql, /grant select, insert, update, delete on public\.inv_gmail to service_role/);
  assert.doesNotMatch(sql, /grant [^;]*on public\.inv_gmail[^;]*authenticated/);
  assert.match(sql, /c\.relname = 'olb_roadmap_events'/);
  assert.match(sql, /grant select on public\.olb_roadmap_events to authenticated, service_role/);
  assert.match(sql, /grant insert, update, delete on public\.olb_roadmap_events to service_role/);
});

test("migrations numbered 0154 and later that create a public table, sequence, or function include a matching grant", () => {
  const names = migrationFiles();
  const failures: string[] = [];
  for (const name of names) {
    if (migrationNumber(name) < CHECK_FROM) continue;
    const sql = stripSqlComments(readFileSync(join(migrationsDir, name), "utf8"));
    for (const table of ungrantedPublicTables(sql)) {
      failures.push(
        `${name} creates public.${table} without grant … on public.${table} to authenticated, service_role (or service_role only / anon select when that is the access)`,
      );
    }
    for (const seq of ungrantedPublicSequences(sql)) {
      failures.push(
        `${name} creates sequence public.${seq} without grant usage, select on sequence public.${seq} to anon, authenticated, or service_role`,
      );
    }
    for (const fn of ungrantedPublicFunctions(sql)) {
      failures.push(
        `${name} creates function public.${fn} without grant execute on function public.${fn}(…) to anon, authenticated, or service_role`,
      );
    }
  }
  assert.deepEqual(failures, []);
});
