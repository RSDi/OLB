import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { resolveMembership } from "../../../lib/auth/resolve-membership";
import { logSignIn } from "../../../lib/activity/log";
import { resolveReturnTo } from "../../../lib/auth/pairing";
import {
  RETURN_TO_COOKIE,
  requestIsHttps,
  returnToCookieOptions,
} from "../../../lib/auth/pairing-cookie";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "recovery" | "invite" | null;
  const next = searchParams.get("next");
  const store = await cookies();
  const dest = resolveReturnTo(next, store.get(RETURN_TO_COOKIE)?.value) ?? "/portal";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failToLogin(origin, dest, request);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return failToLogin(origin, dest, request);
    // Password recovery (legacy token_hash format) — keep session, go to reset.
    if (type === "recovery") return NextResponse.redirect(`${origin}/reset-password`);
  } else {
    return failToLogin(origin, dest, request);
  }

  // Password recovery via the modern PKCE code flow — keep the session and
  // send to the reset page, skipping the members check (which would sign the
  // user out for pending/denied accounts).
  if (next === "/reset-password") {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    await supabase.auth.signOut();
    return failToLogin(origin, dest, request);
  }

  const { status } = await resolveMembership({ supabase, user });

  if (status !== "approved") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?status=${status}`);
  }

  await logSignIn(supabase, user.id, code ? "oauth" : "email_link", request.headers.get("user-agent"));

  store.set(RETURN_TO_COOKIE, "", {
    ...returnToCookieOptions(requestIsHttps(request.headers, new URL(request.url).protocol), 0),
  });
  return NextResponse.redirect(`${origin}${dest}`);
}

function failToLogin(origin: string, dest: string, request: Request) {
  const next = dest === "/portal" ? null : dest;
  const q = new URLSearchParams({ error: "failed" });
  if (next) q.set("next", next);
  const res = NextResponse.redirect(`${origin}/login?${q}`);
  if (next) {
    res.cookies.set(
      RETURN_TO_COOKIE,
      next,
      returnToCookieOptions(requestIsHttps(request.headers, new URL(request.url).protocol))
    );
  }
  return res;
}
