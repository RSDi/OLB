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
import { isStaff, isSuperAdmin, type MemberLike } from "./permissions";

type GateResult = { error: string } | { userId: string };

async function loadCaller(): Promise<{ userId: string; member: MemberLike | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  return { userId: user.id, member: (data as MemberLike | null) ?? null };
}

export async function requireStaff(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isStaff(caller.member)) {
    return { error: "Building committee access required." };
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
