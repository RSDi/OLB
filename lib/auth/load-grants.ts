// The signed-in person's grants, for permissions.ts.
//
// With migration 0122 they come from public.my_permissions(): their access
// profile's permissions plus their extras. Before 0122 that function doesn't
// exist, so they're read from the old per-grant columns instead, each in its
// own best-effort query so a missing later column can't hide an earlier one.
// Live President/AD/Treasurer hold comes from holds_invoicing_planning_role
// (0152). Anything that fails reads as no grant, the safe default.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PERMISSIONS, grantsFromPermissions } from "./access";
import type { MemberLike } from "./permissions";

export async function loadGrants(supabase: SupabaseClient, userId: string): Promise<Partial<MemberLike>> {
  const [perms, roleHold] = await Promise.all([
    supabase.rpc("my_permissions"),
    supabase.rpc("holds_invoicing_planning_role"),
  ]);
  // 0152 not applied yet → RPC missing. False is the safe default.
  const holds_invoicing_planning_role = !roleHold.error && roleHold.data === true;
  if (!perms.error && Array.isArray(perms.data)) {
    return { ...grantsFromPermissions(perms.data as string[]), holds_invoicing_planning_role };
  }

  const columns = [
    "can_edit_settings, can_delete_settings, can_undelete_settings",
    ...PERMISSIONS.flatMap((p) => (p.legacyColumn && !p.legacyColumn.endsWith("_settings") ? [p.legacyColumn] : [])),
  ];
  const rows = await Promise.all(
    columns.map((cols) => supabase.from("members").select(cols).eq("user_id", userId).maybeSingle())
  );
  const out: Partial<MemberLike> = { holds_invoicing_planning_role };
  for (const { data: row } of rows) {
    for (const p of PERMISSIONS) {
      if (!p.legacyColumn) continue;
      const v = (row as Record<string, unknown> | null)?.[p.legacyColumn];
      if (v !== undefined) out[p.legacyColumn] = !!v;
    }
  }
  return out;
}
