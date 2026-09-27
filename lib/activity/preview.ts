// "Preview as" — a super-admin sees the portal exactly as one member does.
//
// Unlike a UI-only role switch, the super-admin's browser is signed in to a
// real Supabase session for the member, so every page, query and RLS policy
// behaves just as it does for them. A member_previews row (migration 0099)
// ties that session back to the super-admin, and the olb_preview cookie
// (./preview-cookie.ts) holds the secret that proves this browser started it.
//
// Start: app/portal/activity/actions.ts. Exit (banner button, sign-out, or the
// 2-hour limit via middleware): app/auth/preview/exit/route.ts, which signs
// the member's preview session out and signs the super-admin back in.
//
// Anything done during a preview really happens, as the member. The activity
// trail and the member audit log both record the super-admin behind it.
//
// Server-only.

import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { getAuthUser } from "../auth/viewer";
import { memberDisplayName } from "../members/display";
import { PREVIEW_COOKIE, parsePreviewCookie } from "./preview-cookie";

export interface ActivePreview {
  id: string;
  impersonatorUserId: string;
  impersonatorSid: string | null;
  impersonatorName: string;
  targetUserId: string;
  targetName: string;
  expiresAt: string;
  expired: boolean;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// The preview this request is part of, or null. Only a cookie whose secret
// matches an open preview row *for the session this browser is signed in to*
// counts, so a stale or copied cookie does nothing. Costs no database call
// when there's no cookie (i.e. for everyone who isn't previewing).
export const getPreview = cache(async (): Promise<ActivePreview | null> => {
  const cookie = parsePreviewCookie((await cookies()).get(PREVIEW_COOKIE)?.value);
  if (!cookie) return null;
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("member_previews")
    .select("id, secret_hash, impersonator_user_id, impersonator_sid, target_user_id, target_session_id, expires_at, ended_at")
    .eq("id", cookie.id)
    .maybeSingle();
  const row = data as {
    id: string;
    secret_hash: string;
    impersonator_user_id: string;
    impersonator_sid: string | null;
    target_user_id: string;
    target_session_id: string | null;
    expires_at: string;
    ended_at: string | null;
  } | null;
  if (!row || row.ended_at) return null;
  if (!sameHash(row.secret_hash, hashSecret(cookie.secret))) return null;
  if (row.target_user_id !== user.id || !row.target_session_id || row.target_session_id !== user.sessionId) {
    return null;
  }

  const { data: people } = await admin
    .from("members")
    .select("user_id, full_name, nickname, email")
    .in("user_id", [row.impersonator_user_id, row.target_user_id]);
  const names = new Map<string, string>();
  for (const p of (people as { user_id: string; full_name: string | null; nickname: string | null; email: string | null }[]) ?? []) {
    names.set(p.user_id, memberDisplayName(p));
  }

  return {
    id: row.id,
    impersonatorUserId: row.impersonator_user_id,
    impersonatorSid: row.impersonator_sid,
    impersonatorName: names.get(row.impersonator_user_id) ?? "A super-admin",
    targetUserId: row.target_user_id,
    targetName: names.get(row.target_user_id) ?? "this member",
    expiresAt: row.expires_at,
    expired: Date.parse(row.expires_at) <= Date.now(),
  };
});

export interface MintedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

function jwtSessionId(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload?.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

// A fresh sign-in session for `userId`, made server-side: the admin API issues
// a one-time magic-link token (no email is sent) and it's redeemed straight
// away on a throwaway client, so nothing touches this browser's cookies yet.
export async function mintSession(userId: string): Promise<MintedSession> {
  const admin = createAdminClient();
  const { data: u, error: userError } = await admin.auth.admin.getUserById(userId);
  const email = u?.user?.email;
  if (userError || !email) throw new Error("Couldn't find that account's sign-in.");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error(linkError?.message ?? "Couldn't start a session.");

  const plain = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: verified, error: verifyError } = await plain.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  const session = verified?.session;
  if (verifyError || !session) throw new Error(verifyError?.message ?? "Couldn't start a session.");
  const sessionId = jwtSessionId(session.access_token);
  if (!sessionId) throw new Error("Couldn't start a session.");

  return { accessToken: session.access_token, refreshToken: session.refresh_token, sessionId };
}

// Ends a minted session that never reached a browser (a preview that failed
// to start), so no live sign-in is left behind.
export async function revokeSession(minted: MintedSession): Promise<void> {
  try {
    await createAdminClient().auth.admin.signOut(minted.accessToken, "local");
  } catch {
    // best effort
  }
}

// Signs this browser out of its current session (only this one — never the
// account's other devices) and into `minted`. Server Action / Route Handler
// only, since it writes the auth cookies.
export async function switchBrowserSession(minted: MintedSession): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const { error } = await supabase.auth.setSession({
    access_token: minted.accessToken,
    refresh_token: minted.refreshToken,
  });
  if (error) throw new Error(error.message);
}
