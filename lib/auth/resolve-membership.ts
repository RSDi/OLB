// Server-side helper used by both the OAuth callback and the post-signin
// route. Given an already-authenticated session, bootstraps admin from
// ADMIN_EMAILS (if applicable), inserts a pending member row for brand-new
// users, and returns the resolved membership status.
//
// Keeping this in one place means the OAuth path and the email/password path
// agree on who counts as admin, who counts as pending, etc.

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { isAdminEmail } from "./admin-emails";
import { sendAccessRequestNotification } from "../notifications/access-request";

export type MemberStatus = "pending" | "approved" | "denied";

export interface ResolvedMembership {
  status: MemberStatus;
  isAdmin: boolean;
}

export async function resolveMembership({
  supabase,
  user,
}: {
  supabase: SupabaseClient;
  user: User;
}): Promise<ResolvedMembership> {
  if (!user.email) {
    return { status: "denied", isAdmin: false };
  }

  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;

  if (isAdminEmail(user.email)) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await admin
        .from("members")
        .update({
          status: "approved",
          is_admin: true,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await admin.from("members").insert({
        user_id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        status: "approved",
        is_admin: true,
        reviewed_at: new Date().toISOString(),
      });
    }
  }

  const { data: member } = await supabase
    .from("members")
    .select("status, is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    await supabase.from("members").insert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
    });
    sendAccessRequestNotification({ email: user.email, fullName }).catch(
      (err) => console.error("[notify] failed:", err)
    );
    return { status: "pending", isAdmin: false };
  }

  return {
    status: member.status as MemberStatus,
    isAdmin: Boolean(member.is_admin),
  };
}
