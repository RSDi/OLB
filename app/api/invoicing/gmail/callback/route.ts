// GET /api/invoicing/gmail/callback — Google returns here with a code.
// Exchange it, encrypt the refresh token, save the address, never send
// the token to the browser.

import { NextResponse, type NextRequest } from "next/server";
import { requireInvoicing } from "../../../../../lib/auth/guards";
import { decryptSecret, encryptSecret, invoiceGmailTokenKey } from "../../../../../lib/invoicing/gmail-crypto";
import {
  GMAIL_CONNECT_COOKIE,
  exchangeGmailCode,
  gmailRedirectOrigin,
  invoiceGmailLive,
  gmailUserEmail,
  readOAuthStateCookie,
  safeInvoiceReturn,
} from "../../../../../lib/invoicing/gmail-oauth";
import { saveGmailConnection } from "../../../../../lib/invoicing/gmail-settings";

export async function GET(req: NextRequest) {
  const bounceOrigin = gmailRedirectOrigin() ?? req.nextUrl.origin;
  const done = (code: string, nextPath = "/portal/payments?tab=invoices") => {
    const next = safeInvoiceReturn(nextPath);
    const url = new URL(next, bounceOrigin);
    if (url.pathname === "/portal/payments" && !url.searchParams.get("tab")) url.searchParams.set("tab", "invoices");
    url.searchParams.set("gmail", code);
    const res = NextResponse.redirect(url);
    res.cookies.set(GMAIL_CONNECT_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!invoiceGmailLive()) return done("production-only");

  const gate = await requireInvoicing();
  if ("error" in gate) return done("not-allowed");

  const state = req.nextUrl.searchParams.get("state");
  const stored = readOAuthStateCookie(req.cookies.get(GMAIL_CONNECT_COOKIE)?.value, state, gate.userId);
  if (!stored) return done("failed");

  const err = req.nextUrl.searchParams.get("error");
  if (err) return done(err === "access_denied" ? "denied" : "failed", stored.next);

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return done("failed", stored.next);

  try {
    const tokens = await exchangeGmailCode(code);
    // Round-trip encrypt so a bad INVOICE_GMAIL_TOKEN_KEY fails here, not later.
    const key = invoiceGmailTokenKey();
    decryptSecret(encryptSecret(tokens.refreshToken, key), key);
    const email = await gmailUserEmail(tokens.accessToken);
    if (!email) return done("failed", stored.next);
    await saveGmailConnection({
      refreshToken: tokens.refreshToken,
      senderEmail: email,
      connectedBy: gate.userId,
    });
    return done("connected", stored.next);
  } catch {
    return done("failed", stored.next);
  }
}
