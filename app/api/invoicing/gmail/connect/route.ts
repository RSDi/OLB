// GET /api/invoicing/gmail/connect — send an invoicing holder to Google so
// invoices can go out through that Gmail account. Callback stores the
// refresh token encrypted.

import { NextResponse, type NextRequest } from "next/server";
import { requireInvoicing } from "../../../../../lib/auth/guards";
import { getPreview } from "../../../../../lib/activity/preview";
import {
  GMAIL_CONNECT_COOKIE,
  gmailAuthorizeUrl,
  gmailOAuthConfigured,
  gmailRedirectOrigin,
  newOAuthState,
  oauthStateCookie,
  safeInvoiceReturn,
} from "../../../../../lib/invoicing/gmail-oauth";

export async function GET(req: NextRequest) {
  const next = safeInvoiceReturn(req.nextUrl.searchParams.get("next"));
  const bounceOrigin = gmailRedirectOrigin() ?? req.nextUrl.origin;
  const fail = (code: string) => {
    const url = new URL(next, bounceOrigin);
    if (url.pathname === "/portal/payments" && !url.searchParams.get("tab")) url.searchParams.set("tab", "invoices");
    url.searchParams.set("gmail", code);
    return NextResponse.redirect(url);
  };

  const gate = await requireInvoicing();
  if ("error" in gate) return fail("not-allowed");
  if (await getPreview()) return fail("preview");
  if (!gmailOAuthConfigured()) return fail("not-set-up");

  const origin = gmailRedirectOrigin();
  if (!origin) return fail("not-set-up");

  const state = newOAuthState();
  const res = NextResponse.redirect(gmailAuthorizeUrl(state));
  res.cookies.set(GMAIL_CONNECT_COOKIE, oauthStateCookie(state, next, gate.userId), {
    httpOnly: true,
    secure: origin.startsWith("https:"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
