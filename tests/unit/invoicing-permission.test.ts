// Invoicing permission (0152): send/record vs view-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canChangeInvoicingPlanningHolder,
  canManageInvoicing,
  canViewInvoices,
  hasPermission,
  INVOICING_PLANNING_HOLDER_ERROR,
  INVOICING_PLANNING_ROLE_SEEDS,
  invoicingPlanningWriteRequiresSuperAdmin,
  isInvoicingPlanningRoleSeed,
  type MemberLike,
} from "../../lib/auth/permissions.ts";

const approved = (perms: string[], extra: Partial<MemberLike> = {}): MemberLike => ({
  role: "member",
  status: "approved",
  permissions: perms,
  ...extra,
});

test("invoicing sends; board/payments/finances_view may only view", () => {
  assert.equal(canManageInvoicing(approved(["invoicing"])), true);
  assert.equal(canViewInvoices(approved(["invoicing"])), true);

  assert.equal(canManageInvoicing(approved(["payments"], { can_manage_finances: true })), false);
  assert.equal(canViewInvoices(approved(["payments"], { can_manage_finances: true })), true);

  assert.equal(canManageInvoicing(approved(["finances_view"])), false);
  assert.equal(canViewInvoices(approved(["finances_view"])), true);

  assert.equal(canManageInvoicing({ role: "admin", status: "approved", permissions: [] }), false);
  assert.equal(canViewInvoices({ role: "admin", status: "approved", permissions: [] }), true);

  assert.equal(canManageInvoicing(approved([])), false);
  assert.equal(canViewInvoices(approved([])), false);

  assert.equal(canManageInvoicing({ role: "member", status: "pending", permissions: ["invoicing"] }), false);
  assert.equal(hasPermission({ role: "super_admin", status: "approved" }, "invoicing"), true);
  assert.equal(canManageInvoicing({ role: "super_admin", status: "approved" }), true);
});

test("planning-role holder can invoice; former holder cannot; board with neither only reads; super_admin can", () => {
  assert.deepEqual([...INVOICING_PLANNING_ROLE_SEEDS], [
    "role:president",
    "role:athletic_director",
    "role:treasurer",
  ]);

  const holder = approved([], { holds_invoicing_planning_role: true });
  assert.equal(canManageInvoicing(holder), true);
  assert.equal(canViewInvoices(holder), true);

  const former = approved([], { holds_invoicing_planning_role: false });
  assert.equal(canManageInvoicing(former), false);
  assert.equal(canViewInvoices(former), false);

  const board = { role: "admin" as const, status: "approved" as const, permissions: [] as string[], holds_invoicing_planning_role: false };
  assert.equal(canManageInvoicing(board), false);
  assert.equal(canViewInvoices(board), true);

  const superAdmin = { role: "super_admin" as const, status: "approved" as const, permissions: [] as string[], holds_invoicing_planning_role: false };
  assert.equal(canManageInvoicing(superAdmin), true);
  assert.equal(canViewInvoices(superAdmin), true);

  assert.equal(canManageInvoicing({ role: "super_admin", status: "pending" }), false);
  assert.equal(canManageInvoicing({ role: "member", status: "pending", holds_invoicing_planning_role: true }), false);
});

test("only super_admin can change Held by on invoicing planning roles; Board cannot", () => {
  const board: MemberLike = { role: "admin", status: "approved" };
  const superAdmin: MemberLike = { role: "super_admin", status: "approved" };
  const member: MemberLike = { role: "member", status: "approved" };

  assert.equal(isInvoicingPlanningRoleSeed("role:president"), true);
  assert.equal(isInvoicingPlanningRoleSeed("role:athletic_director"), true);
  assert.equal(isInvoicingPlanningRoleSeed("role:treasurer"), true);
  assert.equal(isInvoicingPlanningRoleSeed("role:communications"), false);

  assert.equal(canChangeInvoicingPlanningHolder(superAdmin), true);
  assert.equal(canChangeInvoicingPlanningHolder(board), false);
  assert.equal(canChangeInvoicingPlanningHolder(member), false);
  assert.equal(canChangeInvoicingPlanningHolder({ role: "super_admin", status: "pending" }), false);

  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:president", memberIdChanged: true }), true);
  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:athletic_director", memberIdChanged: true }), true);
  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:treasurer", removed: true }), true);
  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:president", keyChanged: true }), true);
  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:president", memberIdChanged: false }), false);
  assert.equal(invoicingPlanningWriteRequiresSuperAdmin({ oldSeed: "role:communications", memberIdChanged: true }), false);
  assert.equal(INVOICING_PLANNING_HOLDER_ERROR.includes("super-admin"), true);
});
