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
import { sendAccessRequestSlack } from "../notifications/slack";
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

  // Seamless church access: a sign-in via the church's Slack workspace (team id
  // matches SLACK_TEAM_ID) is auto-approved — no committee gate. Any other
  // sign-in (email, or Slack from a different workspace) stays pending. Fails
  // safe: if the team claim is missing or SLACK_TEAM_ID isn't set, no auto-approve.
  const churchTeam = process.env.SLACK_TEAM_ID?.trim() || null;
  const isChurchSlack = !!churchTeam && slackTeamId(user) === churchTeam;

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
    .select("status, role, access_revoked_at")
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

    // Church-Slack sign-ins are approved on the spot (admin client so we're not
    // relying on RLS to allow a self-approve); everyone else lands pending and
    // notifies the committee.
    if (isChurchSlack) {
      const admin = createAdminClient();
      await admin.from("members").insert({
        user_id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        status: "approved",
        reviewed_at: new Date().toISOString(),
      });
      return { status: "approved", role: "member" };
    }

    await supabase.from("members").insert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
    });
    sendAccessRequestNotification({ email: user.email, fullName }).catch(
      (err) => console.error("[notify] access-request email failed:", err)
    );
    sendAccessRequestSlack({ email: user.email, fullName }).catch(
      (err) => console.error("[notify] access-request slack failed:", err)
    );
    return { status: "pending", role: "member" };
  }

  // A revoked member (login disabled by a super-admin, e.g. they left the
  // church) is denied even if the auth ban was somehow bypassed. Their
  // directory entry stays; portal access does not.
  if ((member as { access_revoked_at?: string | null }).access_revoked_at) {
    return { status: "denied", role: (member.role as MemberRole) ?? "member" };
  }

  // A still-pending member who signs in via the church Slack gets approved now.
  if (member.status === "pending" && isChurchSlack) {
    const admin = createAdminClient();
    await admin
      .from("members")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return { status: "approved", role: (member.role as MemberRole) ?? "member" };
  }

  return {
    status: member.status as MemberStatus,
    role: (member.role as MemberRole) ?? "member",
  };
}

// Pull the Slack workspace (team) id out of a Slack OIDC sign-in, checking the
// claim's usual locations. Returns null for non-Slack sign-ins.
function slackTeamId(user: User): string | null {
  const pick = (o: Record<string, unknown> | null | undefined): string | null => {
    if (!o) return null;
    for (const k of ["https://slack.com/team_id", "team_id"]) {
      const v = o[k];
      if (typeof v === "string" && v) return v;
    }
    return null;
  };
  const ident = (user.identities ?? []).find(
    (i) => i.provider === "slack_oidc" || i.provider === "slack",
  );
  return (
    pick(user.user_metadata as Record<string, unknown>) ??
    pick(ident?.identity_data as Record<string, unknown> | undefined)
  );
}

