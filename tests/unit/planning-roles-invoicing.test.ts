// 0153: super-admin only can change Held by on invoicing planning roles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  INVOICING_PLANNING_HOLDER_ERROR,
  INVOICING_PLANNING_ROLE_SEEDS,
} from "../../lib/auth/permissions.ts";

const root = join(import.meta.dirname, "../..");
const migration = readFileSync(join(root, "supabase/migrations/0153_planning_roles_invoicing_holder.sql"), "utf8");
const down = readFileSync(join(root, "supabase/removal/0153_planning_roles_invoicing_holder_down.sql"), "utf8");
const actions = readFileSync(join(root, "lib/planning/actions.ts"), "utf8");
const tab = readFileSync(join(root, "app/portal/settings/PlanningRolesTab.tsx"), "utf8");

test("0153 is the next numbered migration after 0152", () => {
  const names = readdirSync(join(root, "supabase/migrations")).filter((n) => n.endsWith(".sql")).sort();
  assert.ok(names.includes("0152_invoicing.sql"));
  assert.ok(names.includes("0153_planning_roles_invoicing_holder.sql"));
  assert.equal(names.filter((n) => n.startsWith("0153")).length, 1, "only one 0153 migration");
});

test("0153 trigger is super-admin only on the three invoicing seed keys", () => {
  assert.match(migration, /create trigger planning_roles_invoicing_holder_guard/);
  assert.match(migration, /before insert or update or delete on public\.planning_roles/);
  assert.match(migration, /not \(select public\.is_super_admin\(\)\)/);
  assert.doesNotMatch(migration, /is_staff\(\)/);
  assert.doesNotMatch(migration, /role = 'admin'/);
  for (const key of INVOICING_PLANNING_ROLE_SEEDS) {
    assert.ok(migration.includes(`'${key}'`), key);
  }
  assert.ok(migration.includes(INVOICING_PLANNING_HOLDER_ERROR));
  assert.match(migration, /old\.member_id is distinct from new\.member_id/);
  assert.match(migration, /old\.seed_key is distinct from new\.seed_key/);
  assert.match(migration, /old\.deleted_at is distinct from new\.deleted_at/);
});

test("0153 down drops the trigger and function", () => {
  assert.match(down, /drop trigger if exists planning_roles_invoicing_holder_guard/);
  assert.match(down, /drop function if exists public\.planning_roles_invoicing_holder_guard\(\)/);
});

test("server action and UI reject Board changing Held by on invoicing roles", () => {
  assert.match(actions, /invoicingPlanningWriteRequiresSuperAdmin/);
  assert.match(actions, /INVOICING_PLANNING_HOLDER_ERROR/);
  assert.match(actions, /!viewer\?\.isSuperAdmin/);
  assert.match(tab, /lockHolder=\{isInvoicingPlanningRoleSeed\(r\.seed_key\) && !canChangeInvoicingHolder\}/);
  assert.match(tab, /Only a super-admin can change who holds this/);
  assert.match(tab, /disabled=\{lockHolder\}/);
});
