import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { resolveMembership } from "../../../lib/auth/resolve-membership";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "email" | "recovery" | "invite" | null;
  const next = searchParams.get("next");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=failed`);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return NextResponse.redirect(`${origin}/login?error=failed`);
    // Password recovery (legacy token_hash format) — keep session, go to reset.
    if (type === "recovery") return NextResponse.redirect(`${origin}/reset-password`);
  } else {
    return NextResponse.redirect(`${origin}/login?error=failed`);
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
    return NextResponse.redirect(`${origin}/login?error=failed`);
  }

  const { status } = await resolveMembership({ supabase, user });

  if (status !== "approved") {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?status=${status}`);
  }

  return NextResponse.redirect(`${origin}/portal`);
}
