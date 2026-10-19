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
  newOAuthState,
  oauthStateCookie,
  safeInvoiceReturn,
} from "../../../../../lib/invoicing/gmail-oauth";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const next = safeInvoiceReturn(req.nextUrl.searchParams.get("next"));
  const fail = (code: string) => {
    const url = new URL(next, origin);
    if (url.pathname === "/portal/payments" && !url.searchParams.get("tab")) url.searchParams.set("tab", "invoices");
    url.searchParams.set("gmail", code);
    return NextResponse.redirect(url);
  };

  const gate = await requireInvoicing();
  if ("error" in gate) return fail("not-allowed");
  if (await getPreview()) return fail("preview");
  if (!gmailOAuthConfigured()) return fail("not-set-up");

  const state = newOAuthState();
  const res = NextResponse.redirect(gmailAuthorizeUrl(origin, state));
  res.cookies.set(GMAIL_CONNECT_COOKIE, oauthStateCookie(state, next), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
