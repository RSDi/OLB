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
import type { MemberRole, MemberStatus } from "./permissions";

export type { MemberRole, MemberStatus };

export interface ResolvedMembership {
  status: MemberStatus;
  role: MemberRole;
}

export async function resolveMembership({
  supabase,
  user,
}: {
  supabase: SupabaseClient;
  user: User;
}): Promise<ResolvedMembership> {
  if (!user.email) {
    return { status: "denied", role: "member" };
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
          role: "super_admin",
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
        role: "super_admin",
        reviewed_at: new Date().toISOString(),
      });
    }
  }

  const { data: member } = await supabase
    .from("members")
    .select("status, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) {
    // Check for a pre-created (orphan) member row a super-admin set up with
    // matching email but no user_id yet. If found, link it instead of
    // creating a new pending row — preserve whatever role/status the
    // super-admin set, and keep the pre-set name if there is one.
    const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;
    const linkClient = admin ?? supabase;
    const { data: orphan } = await linkClient
      .from("members")
      .select("id, status, role, full_name")
      .ilike("email", user.email)
      .is("user_id", null)
      .maybeSingle();

    if (orphan) {
      await linkClient
        .from("members")
        .update({
          user_id: user.id,
          full_name: orphan.full_name ?? fullName,
          avatar_url: avatarUrl,
        })
        .eq("id", orphan.id);
      return {
        status: orphan.status as MemberStatus,
        role: (orphan.role as MemberRole) ?? "member",
      };
    }

    await supabase.from("members").insert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
    });
    sendAccessRequestNotification({ email: user.email, fullName }).catch(
      (err) => console.error("[notify] failed:", err)
    );
    return { status: "pending", role: "member" };
  }

  return {
    status: member.status as MemberStatus,
    role: (member.role as MemberRole) ?? "member",
  };
}

