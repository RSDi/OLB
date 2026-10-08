// The signed-in person's grants, for permissions.ts.
//
// With migration 0122 they come from public.my_permissions(): their access
// profile's permissions plus their extras. Before 0122 that function doesn't
// exist, so they're read from the old per-grant columns instead, each in its
// own best-effort query so a missing later column can't hide an earlier one.
// Anything that fails reads as no grant, the safe default.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PERMISSIONS, grantsFromPermissions } from "./access";
import type { MemberLike } from "./permissions";

export async function loadGrants(supabase: SupabaseClient, userId: string): Promise<Partial<MemberLike>> {
  const { data, error } = await supabase.rpc("my_permissions");
  if (!error && Array.isArray(data)) return grantsFromPermissions(data as string[]);

  const columns = [
    "can_edit_settings, can_delete_settings, can_undelete_settings",
    ...PERMISSIONS.map((p) => p.legacyColumn).filter((c) => !c.endsWith("_settings")),
  ];
  const rows = await Promise.all(
    columns.map((cols) => supabase.from("members").select(cols).eq("user_id", userId).maybeSingle())
  );
  const out: Partial<MemberLike> = {};
  for (const { data: row } of rows) {
    for (const p of PERMISSIONS) {
      const v = (row as Record<string, unknown> | null)?.[p.legacyColumn];
      if (v !== undefined) out[p.legacyColumn] = !!v;
    }
  }
  return out;
}
