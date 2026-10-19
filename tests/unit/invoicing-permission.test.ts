// Invoicing permission (0152): send/record vs view-only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canManageInvoicing, canViewInvoices, hasPermission, type MemberLike } from "../../lib/auth/permissions.ts";

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

test("invoicing follows Treasurer/President/Athletic Director and super_admin", () => {
  // Access-profile holders get "invoicing" in their computed permissions.
  // The key lives on the profile, not as a per-person extra.
  for (const role of ["Treasurer", "President", "Athletic Director"]) {
    assert.equal(canManageInvoicing(approved(["invoicing"])), true, role);
  }
  assert.equal(canManageInvoicing({ role: "super_admin", status: "approved", permissions: [] }), true);
  assert.equal(canManageInvoicing({ role: "super_admin", status: "pending" }), false);
  assert.equal(canManageInvoicing({ role: "admin", status: "approved", permissions: [] }), false);
  assert.equal(canManageInvoicing(approved([])), false);
});
