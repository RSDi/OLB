// Server-side post-signin handler.
//
// Called by the client right after a successful Supabase sign-in (email/password,
// OAuth, or magic link). Resolves membership via the shared helper and returns
// the status so the client can route appropriately.
//
// Security: bootstrap is gated by the server-side ADMIN_EMAILS env var, not by
// anything the client sends. The endpoint trusts the session cookie only.

import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { resolveMembership } from "../../../../lib/auth/resolve-membership";
import { logSignIn } from "../../../../lib/activity/log";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const result = await resolveMembership({ supabase, user });
  if (result.status === "approved") {
    await logSignIn(supabase, user.id, "portal", request.headers.get("user-agent"));
  }
  return NextResponse.json(result);
}
