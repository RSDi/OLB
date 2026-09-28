// Ends a "Preview as" (lib/activity/preview.ts): the banner's "Exit preview"
// button, "Sign out" during a preview (?reason=logout), and middleware once
// the 2-hour limit passes (?reason=expired).
//
// Signs the member's preview session out — this browser's only, never their
// own devices — and signs the super-admin back in, unless they asked to sign
// out or are no longer a super-admin, in which case they land on the login
// page. A GET with a fixed path so middleware can send people here.

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../../lib/supabase/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { getAuthUser } from "../../../../lib/auth/viewer";
import { logActivity, memberLabel } from "../../../../lib/activity/log";
import { getPreview, mintSession, switchBrowserSession } from "../../../../lib/activity/preview";
import { PREVIEW_COOKIE } from "../../../../lib/activity/preview-cookie";

type Reason = "exit" | "logout" | "expired";

export async function GET(req: NextRequest) {
  const asked = req.nextUrl.searchParams.get("reason");
  const preview = await getPreview();
  const cookieStore = await cookies();
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (!preview) {
    // Nothing to end (already ended, or a stale cookie). Clear it so
    // middleware stops sending this browser here.
    cookieStore.delete(PREVIEW_COOKIE);
    return to(asked === "logout" ? "/login" : "/portal");
  }

  const reason: Reason = asked === "logout" ? "logout" : asked === "expired" || preview.expired ? "expired" : "exit";
  const admin = createAdminClient();

  // Is the super-admin still one? If not, they don't get their session back.
  const { data: me } = await admin
    .from("members")
    .select("user_id, role, status, access_revoked_at, deleted_at")
    .eq("user_id", preview.impersonatorUserId)
    .maybeSingle();
  const row = me as { role: string; status: string; access_revoked_at: string | null; deleted_at: string | null } | null;
  const stillSuper =
    !!row && row.role === "super_admin" && row.status === "approved" && !row.access_revoked_at && !row.deleted_at;

  const user = await getAuthUser();
  const target = await memberLabel(preview.targetUserId);
  const endReason = stillSuper ? reason : "invalid";
  await admin
    .from("member_previews")
    .update({ ended_at: new Date().toISOString(), end_reason: endReason })
    .eq("id", preview.id)
    .is("ended_at", null);
  const base = {
    sid: user?.sessionId ?? null,
    userId: preview.targetUserId,
    userName: target.name,
    role: target.role,
    impersonatorUserId: preview.impersonatorUserId,
    impersonatorSid: preview.impersonatorSid,
  };
  await logActivity([
    { ...base, eventType: "preview_stop", meta: { reason: endReason, impersonator_name: preview.impersonatorName } },
    ...(reason === "logout" ? [{ ...base, eventType: "logout" as const, meta: { impersonator_name: preview.impersonatorName } }] : []),
  ]);

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  cookieStore.delete(PREVIEW_COOKIE);

  if (reason === "logout" || !stillSuper) return to("/login");

  try {
    await switchBrowserSession(await mintSession(preview.impersonatorUserId));
  } catch {
    return to("/login");
  }
  return to(`/portal/activity?u=${encodeURIComponent(preview.targetUserId)}`);
}
