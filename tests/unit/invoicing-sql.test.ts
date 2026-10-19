// 0152 invoicing: wrapped RLS, inv_ prefix, no FKs to host tables, grants.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { INVOICING_PLANNING_ROLE_SEEDS } from "../../lib/auth/permissions.ts";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0152_invoicing.sql"), "utf8");
const moduleSchema = readFileSync(join(root, "packages/invoicing/migrations/0001_inv_schema.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0152_invoicing_down.sql"), "utf8");

test("0152 is the next numbered migration after 0151", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0151_game_film_youtube_progress.sql"));
  assert.ok(names.includes("0152_invoicing.sql"));
  assert.equal(names.filter((n) => n.startsWith("0152")).length, 1, "only one 0152 migration");
});

test("module schema uses inv_ tables and never FKs host tables", () => {
  assert.match(moduleSchema, /create table if not exists public\.inv_invoices/);
  assert.match(moduleSchema, /host_event_id\s+text/);
  assert.match(moduleSchema, /host_customer_id\s+text/);
  assert.match(moduleSchema, /created_by\s+text/);
  assert.doesNotMatch(moduleSchema, /references public\.(hs_|olb_|members)/i);
  assert.doesNotMatch(moduleSchema, /omaha.?lightning/i);
});

test("0152 copies the module schema and overlays OLB permission helpers", () => {
  assert.ok(migration.includes("create table if not exists public.inv_invoices"));
  assert.ok(migration.includes("create table if not exists public.inv_line_items"));
  assert.ok(migration.includes("create table if not exists public.inv_payments"));
  assert.ok(migration.includes("has_permission('invoicing')"));
  assert.ok(migration.includes("can_manage_invoicing"));
  assert.ok(migration.includes("can_view_invoices"));
  assert.ok(migration.includes("step_key"));
  assert.ok(migration.includes("'bill_programs'"));
  assert.ok(migration.includes("'invoices_sent'"));
  assert.ok(migration.includes("'team_fees_collected'"));
  assert.ok(migration.includes("treasurer"));
  assert.ok(migration.includes("president"));
  assert.ok(migration.includes("athletic director"));
  assert.doesNotMatch(migration, /references public\.(hs_weekends|hs_hosted|olb_|members)/i);
});

test("0152 inv_next_number requires invoicing and access-profile grant is guarded", () => {
  assert.match(migration, /if not coalesce\(public\.inv_can_invoice\(\), false\)/);
  assert.match(migration, /and not \('invoicing' = any \(coalesce\(permissions/);
  assert.match(moduleSchema, /if not coalesce\(public\.inv_can_invoice\(\), false\)/);
});

test("0152 grants invoicing on named profiles if they exist, never writes members", () => {
  assert.match(migration, /update public\.access_profiles/);
  assert.match(migration, /lower\(btrim\(name\)\) in \('treasurer', 'president', 'athletic director'\)/);
  assert.match(migration, /and not \('invoicing' = any \(coalesce\(permissions/);
  assert.doesNotMatch(migration, /extra_permissions/);
  assert.doesNotMatch(migration, /update public\.members/i);
});

test("0152 can_manage_invoicing matches the app: super_admin, live planning role, or invoicing key", () => {
  assert.match(migration, /create or replace function public\.holds_invoicing_planning_role\(\)/);
  assert.match(migration, /create or replace function public\.can_manage_invoicing\(\)/);
  assert.match(migration, /m\.role = 'super_admin'/);
  assert.match(migration, /public\.holds_invoicing_planning_role\(\)/);
  assert.match(migration, /public\.has_permission\('invoicing'\)/);
  assert.match(migration, /join public\.planning_roles r on r\.member_id = m\.id/);
  for (const key of INVOICING_PLANNING_ROLE_SEEDS) {
    assert.ok(migration.includes(`'${key}'`), key);
  }
  const grants = readFileSync(join(root, "lib/auth/load-grants.ts"), "utf8");
  assert.match(grants, /holds_invoicing_planning_role/);
});

test("0152 checklist sort_order shift is skipped when bill_programs already exists", () => {
  assert.match(migration, /if exists \(/);
  assert.match(migration, /s\.step_key = 'bill_programs'/);
  assert.match(migration, /continue;/);
});

test("0152 adds reminder override CHECKs on the alter-column path", () => {
  assert.match(migration, /inv_invoices_reminder_freq_check/);
  assert.match(migration, /inv_invoices_reminder_start_days_check/);
  assert.match(migration, /if not exists \(select 1 from pg_constraint where conname = 'inv_invoices_reminder_freq_check'\)/);
  assert.match(moduleSchema, /constraint inv_invoices_reminder_freq_check/);
  assert.match(moduleSchema, /constraint inv_invoices_reminder_start_days_check/);
});

test("0152 never seeds CC\/BCC addresses", () => {
  assert.doesNotMatch(migration, /lightningbasketballomaha@gmail\.com/i);
  assert.match(migration, /cc_emails\s+text\[\] not null default '\{\}'/);
  assert.match(migration, /bcc_emails\s+text\[\] not null default '\{\}'/);
});

test("0152 RLS wraps helper calls in (select …)", () => {
  assert.ok(migration.includes("using ((select public.inv_can_view_invoices()))"));
  assert.ok(migration.includes("using ((select public.inv_can_invoice()))"));
  assert.ok(migration.includes("with check ((select public.inv_can_invoice()))"));
  assert.ok(!migration.includes("using (public.inv_can_invoice())"));
  assert.ok(!migration.includes("using (public.inv_can_view_invoices())"));
  assert.ok(!migration.includes("using (public.is_staff())"));
  assert.ok(!migration.includes("using (public.has_permission("));
  assert.ok(!migration.includes("to anon"));
  assert.ok(!migration.includes("drop table"));
});

test("0152 down drops module tables and billing step keys", () => {
  assert.ok(down.includes("drop table if exists public.inv_invoices"));
  assert.ok(down.includes("drop function if exists public.can_manage_invoicing()"));
  assert.ok(down.includes("drop function if exists public.holds_invoicing_planning_role()"));
  assert.ok(down.includes("bill_programs"));
  assert.ok(down.includes("drop column if exists step_key"));
});
