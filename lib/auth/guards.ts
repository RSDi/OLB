// Server-action authorization guards (A7 / finding S11).
//
// RLS is the real enforcement layer — these guards are defense-in-depth: a
// second, explicit check in TypeScript so an action fails fast with a clear
// message instead of leaning on a policy, and so a future RLS regression
// can't silently expose a mutation. Call at the top of any staff/super-admin
// server action:
//
//   const gate = await requireStaff();
//   if ("error" in gate) return { error: gate.error };

import { createClient } from "../supabase/server";
import {
  isStaff,
  isSuperAdmin,
  canEditSettings,
  canDeleteSettings,
  canUndeleteSettings,
  canManageFinances,
  type MemberLike,
  type MemberRole,
  type MemberStatus,
} from "./permissions";

type GateResult = { error: string } | { userId: string };

async function loadCaller(): Promise<{ userId: string; member: MemberLike | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { userId: user.id, member: null };
  const row = data as { id: string; role: MemberRole; status: MemberStatus };
  // Settings grants (0057) and the Payments grant (0101), best-effort so the
  // guards work pre-migration (grants default false → no access, the safe
  // default). Separate queries, so a missing 0101 column can't hide 0057's.
  const [{ data: g }, { data: f }] = await Promise.all([
    supabase
      .from("members")
      .select("can_edit_settings, can_delete_settings, can_undelete_settings")
      .eq("id", row.id)
      .maybeSingle(),
    supabase.from("members").select("can_manage_finances").eq("id", row.id).maybeSingle(),
  ]);
  const grants = (g as Partial<MemberLike> | null) ?? {};
  return {
    userId: user.id,
    member: {
      role: row.role,
      status: row.status,
      can_edit_settings: !!grants.can_edit_settings,
      can_delete_settings: !!grants.can_delete_settings,
      can_undelete_settings: !!grants.can_undelete_settings,
      can_manage_finances: !!(f as Partial<MemberLike> | null)?.can_manage_finances,
    },
  };
}

export async function requireStaff(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isStaff(caller.member)) {
    return { error: "Board access required." };
  }
  return { userId: caller.userId };
}

export async function requireSuperAdmin(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isSuperAdmin(caller.member)) {
    return { error: "Super-admin access required." };
  }
  return { userId: caller.userId };
}

// Settings grants (0057). A super-admin always passes; a board member needs
// the matching grant. Use these in settings create/update, soft-delete, and
// restore actions respectively.
export async function requireSettingsEdit(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canEditSettings(caller.member)) {
    return { error: "You don't have permission to edit settings." };
  }
  return { userId: caller.userId };
}

export async function requireSettingsDelete(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canDeleteSettings(caller.member)) {
    return { error: "You don't have permission to delete settings items." };
  }
  return { userId: caller.userId };
}

export async function requireSettingsUndelete(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canUndeleteSettings(caller.member)) {
    return { error: "You don't have permission to restore items." };
  }
  return { userId: caller.userId };
}

// Payments (0101): the Treasurer and anyone else with the Payments grant.
export async function requireFinances(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageFinances(caller.member)) {
    return { error: "You don't have permission to manage payments." };
  }
  return { userId: caller.userId };
}
