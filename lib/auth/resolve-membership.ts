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

  // Seamless access: a user whose Slack identity is from the site's own
  // workspace (team id matches SLACK_TEAM_ID) is auto-approved — no review
  // gate. Everyone else (email sign-ups, Slack from a different workspace)
  // stays pending. The team id comes only from the Slack identity Supabase
  // Auth records (see slackTeamIds). Fails safe: if the team claim is missing
  // or SLACK_TEAM_ID isn't set, no auto-approve.
  const homeTeam = process.env.SLACK_TEAM_ID?.trim() || null;
  const isHomeSlack = !!homeTeam && slackTeamIds(user).includes(homeTeam);

  if (isAdminEmail(user.email)) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("members")
        .update({
          status: "approved",
          role: "super_admin",
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) {
        console.error(`[auth] ADMIN_EMAILS promotion of member ${existing.id} failed:`, error.message);
      }
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
    .select("id, status, role, access_revoked_at, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  // A member row linked before its first real sign-in (a "Preview as" set up
  // the login) never went through the linking below, which is where the photo
  // is copied in. Fill it from this sign-in if the row still has none.
  if (member && !(member as { avatar_url?: string | null }).avatar_url && avatarUrl) {
    const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : null;
    const { error } = await (admin ?? supabase)
      .from("members")
      .update({ avatar_url: avatarUrl })
      .eq("id", (member as { id: string }).id)
      .is("avatar_url", null);
    if (error) console.error(`[auth] filling in the photo for member ${(member as { id: string }).id} failed:`, error.message);
  }

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
      // A pending pre-created row (a parent from a player registration) isn't
      // approved yet: signing in turns it into an access request, dated now,
      // for a super-admin to review like any other.
      const isRequest = orphan.status === "pending";
      const { error } = await linkClient
        .from("members")
        .update({
          user_id: user.id,
          full_name: orphan.full_name ?? fullName,
          avatar_url: avatarUrl,
          ...(isRequest ? { requested_at: new Date().toISOString() } : {}),
        })
        .eq("id", orphan.id);
      if (error) {
        console.error(`[auth] linking pre-created member ${orphan.id} failed:`, error.message);
      } else if (isRequest) {
        const requestName = orphan.full_name ?? fullName;
        sendAccessRequestNotification({ email: user.email, fullName: requestName }).catch(
          (err) => console.error("[notify] access-request email failed:", err)
        );
        sendAccessRequestSlack({ email: user.email, fullName: requestName }).catch(
          (err) => console.error("[notify] access-request slack failed:", err)
        );
      }
      return {
        status: orphan.status as MemberStatus,
        role: (orphan.role as MemberRole) ?? "member",
      };
    }

    // Sign-ins from the site's Slack workspace are approved on the spot (admin
    // client so we're not relying on RLS to allow a self-approve); everyone
    // else lands pending and sends an access-request notification.
    if (isHomeSlack) {
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

  // A still-pending member who signs in via the site's Slack gets approved now.
  if (member.status === "pending" && isHomeSlack) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("members")
      .update({ status: "approved", reviewed_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) {
      console.error(`[auth] home-Slack approval of user ${user.id} failed:`, error.message);
    }
    return { status: "approved", role: (member.role as MemberRole) ?? "member" };
  }

  return {
    status: member.status as MemberStatus,
    role: (member.role as MemberRole) ?? "member",
  };
}

// The Slack workspace (team) ids on the user's Slack identities (provider
// slack_oidc, or the legacy slack); empty if they've never signed in with
// Slack. On each Slack sign-in Supabase Auth rewrites that identity's
// identity_data from Slack's response, with the team id under custom_claims
// (a top-level key is accepted as a fallback). Only identity_data is read:
// user_metadata isn't a trusted source for access decisions. A user can have
// more than one Slack identity (e.g. the same email in two workspaces), so
// all of them are returned.
function slackTeamIds(user: User): string[] {
  const teamClaim = (o: unknown): string | null => {
    if (!o || typeof o !== "object") return null;
    const v = (o as Record<string, unknown>)["https://slack.com/team_id"];
    return typeof v === "string" && v ? v : null;
  };
  return (user.identities ?? [])
    .filter((i) => i.provider === "slack_oidc" || i.provider === "slack")
    .map((i) => teamClaim(i.identity_data?.custom_claims) ?? teamClaim(i.identity_data))
    .filter((id): id is string => id !== null);
}

