"use server";
// Starts a "Preview as" (see lib/activity/preview.ts). Super-admins only.
// The member_previews row is written first and the preview doesn't start
// without it, so there's never a preview the trail doesn't know about.

import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { requireSuperAdmin } from "../../../lib/auth/guards";
import { getAuthUser } from "../../../lib/auth/viewer";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import { createAdminClient } from "../../../lib/supabase/admin";
import { memberDisplayName } from "../../../lib/members/display";
import { logActivity, memberLabel } from "../../../lib/activity/log";
import { getPreview, hashSecret, mintSession, revokeSession, switchBrowserSession } from "../../../lib/activity/preview";
import { previewBlocker, type PreviewTarget } from "../../../lib/activity/preview-rules";
import {
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_MAX_AGE_S,
  PREVIEW_TTL_MS,
  encodePreviewCookie,
} from "../../../lib/activity/preview-cookie";

export async function startPreview(memberId: string): Promise<{ error: string } | { ok: true }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (await getPreview()) return { error: "You're already previewing someone. Exit that preview first." };
  const me = await getAuthUser();
  if (!me) return { error: "You must be signed in." };
  // Staged rollout, like the Activity page itself.
  if (!seesFullUi(me.email)) return { error: "Preview as isn't available on your account yet." };

  const admin = createAdminClient();
  const { data } = await admin
    .from("members")
    .select("id, user_id, full_name, nickname, email, role, status, access_revoked_at, deleted_at")
    .eq("id", memberId)
    .maybeSingle();
  const target = data as (PreviewTarget & {
    id: string;
    full_name: string | null;
    nickname: string | null;
    email: string | null;
  }) | null;
  if (!target) return { error: "Member not found." };
  const blocker = previewBlocker(target, me.id);
  if (blocker) return { error: blocker };
  const targetUserId = target.user_id!;

  const secret = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + PREVIEW_TTL_MS;
  const { data: row, error: insertError } = await admin
    .from("member_previews")
    .insert({
      secret_hash: hashSecret(secret),
      impersonator_user_id: me.id,
      impersonator_sid: me.sessionId,
      target_user_id: targetUserId,
      target_member_id: target.id,
      expires_at: new Date(expiresAt).toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !row) {
    return { error: "Couldn't record the preview, so it wasn't started. Try again." };
  }
  const previewId = (row as { id: string }).id;
  const fail = async (message: string) => {
    await admin
      .from("member_previews")
      .update({ ended_at: new Date().toISOString(), end_reason: "failed" })
      .eq("id", previewId);
    return { error: message };
  };

  let minted;
  try {
    minted = await mintSession(targetUserId);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't start the preview.");
  }
  const { error: pinError } = await admin
    .from("member_previews")
    .update({ target_session_id: minted.sessionId })
    .eq("id", previewId);
  if (pinError) {
    await revokeSession(minted);
    return fail("Couldn't record the preview, so it wasn't started. Try again.");
  }

  try {
    await switchBrowserSession(minted);
  } catch {
    // The super-admin's own session is already gone at this point.
    await revokeSession(minted);
    await fail("");
    return { error: "The preview didn't start and you've been signed out. Please sign in again." };
  }

  (await cookies()).set(PREVIEW_COOKIE, encodePreviewCookie({ id: previewId, secret, expiresAt }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_COOKIE_MAX_AGE_S,
  });

  const myName = (await memberLabel(me.id)).name;
  await logActivity({
    sid: minted.sessionId,
    userId: targetUserId,
    userName: memberDisplayName(target),
    role: target.role,
    eventType: "preview_start",
    impersonatorUserId: me.id,
    impersonatorSid: me.sessionId,
    meta: { impersonator_name: myName, user_agent: (await headers()).get("user-agent") ?? "" },
  });

  return { ok: true };
}
