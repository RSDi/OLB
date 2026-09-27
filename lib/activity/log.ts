// Writes to the activity trail (activity_events, migration 0099): sign-ins,
// sign-outs, page views and "Preview as" start/stop. Server-only — it uses the
// service-role client, since members can't write the table themselves.
//
// logActivity never throws: a failed write goes to the server log and the
// action it describes carries on. Read side: lib/activity/queries.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { memberDisplayName } from "../members/display";

export type ActivityEventType = "login" | "logout" | "page_view" | "preview_start" | "preview_stop";

export interface ActivityEvent {
  sid?: string | null;
  userId: string;
  userName?: string;
  role?: string;
  eventType: ActivityEventType;
  path?: string;
  impersonatorUserId?: string | null;
  impersonatorSid?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: Date; // omit → the database's now()
}

function toRow(e: ActivityEvent) {
  return {
    sid: e.sid ?? null,
    user_id: e.userId,
    user_name: e.userName ?? "",
    role: e.role ?? "",
    event_type: e.eventType,
    path: e.path ?? "",
    impersonator_user_id: e.impersonatorUserId ?? null,
    impersonator_sid: e.impersonatorSid ?? null,
    meta: e.meta ?? {},
    ...(e.createdAt ? { created_at: e.createdAt.toISOString() } : {}),
  };
}

export async function logActivity(events: ActivityEvent | ActivityEvent[]): Promise<void> {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  try {
    const { error } = await createAdminClient().from("activity_events").insert(list.map(toRow));
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[activity] log failed:", err);
  }
}

// Name + role for the trail, looked up by auth user id. Best-effort: an
// unknown user is logged with blanks rather than not at all.
export async function memberLabel(userId: string): Promise<{ name: string; role: string }> {
  try {
    const { data } = await createAdminClient()
      .from("members")
      .select("full_name, nickname, email, role")
      .eq("user_id", userId)
      .maybeSingle();
    const m = data as { full_name: string | null; nickname: string | null; email: string | null; role: string } | null;
    return m ? { name: memberDisplayName(m), role: m.role } : { name: "", role: "" };
  } catch {
    return { name: "", role: "" };
  }
}

// The session id (`session_id` claim) of whoever `supabase` is signed in as.
export async function sessionIdOf(supabase: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const sid = data?.claims?.session_id;
    return typeof sid === "string" && sid ? sid : null;
  } catch {
    return null;
  }
}

// Records a completed sign-in. Called once the member is known to be
// approved, from each place a sign-in finishes.
export async function logSignIn(
  supabase: SupabaseClient,
  userId: string,
  via: string,
  userAgent: string | null
): Promise<void> {
  const [sid, who] = await Promise.all([sessionIdOf(supabase), memberLabel(userId)]);
  await logActivity({
    sid,
    userId,
    userName: who.name,
    role: who.role,
    eventType: "login",
    meta: { via, user_agent: userAgent ?? "" },
  });
}
