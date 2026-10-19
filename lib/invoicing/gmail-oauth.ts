// Google OAuth for the club Gmail invoice sender. Server-only.
// gmail.send — users.messages.send (appears in the connected account's Sent).
// userinfo.email — show the connected address. gmail.send cannot read the
// mailbox, so users.getProfile (restricted) is not used.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { GMAIL_RECONNECT_ERROR, GMAIL_SETUP_ERROR } from "./gmail-meta.ts";

export { GMAIL_RECONNECT_ERROR, GMAIL_SETUP_ERROR };

export const GMAIL_CONNECT_COOKIE = "olb_inv_gmail_oauth";
export const GMAIL_CONNECT_PATH = "/api/invoicing/gmail/connect";
export const GMAIL_CALLBACK_PATH = "/api/invoicing/gmail/callback";
export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];
export const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GMAIL_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function gmailClientId(env: Record<string, string | undefined> = process.env): string {
  return (env.INVOICE_GMAIL_CLIENT_ID ?? "").trim();
}

export function gmailClientSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.INVOICE_GMAIL_CLIENT_SECRET ?? "").trim();
}

export function gmailOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    gmailClientId(env) && gmailClientSecret(env) && (env.INVOICE_GMAIL_TOKEN_KEY ?? "").trim() && gmailRedirectOrigin(env)
  );
}

/** Connect Gmail reads and writes inv_gmail only on Vercel production. */
export function invoiceGmailLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** Fixed site origin for the Google redirect URI. Never the request Host. HTTPS except localhost. */
export function gmailRedirectOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const site = (env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (!site) return null;
  try {
    const url = new URL(site);
    if (!isLocalHostname(url.hostname) && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** If Connect started on apex vs www (or any other host), bounce to NEXT_PUBLIC_SITE_URL first. */
export function gmailCanonicalConnectUrl(
  requestOrigin: string,
  pathWithSearch: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  const origin = gmailRedirectOrigin(env);
  if (!origin) return null;
  try {
    if (new URL(requestOrigin).origin === origin) return null;
  } catch {
    return `${origin}${pathWithSearch.startsWith("/") ? pathWithSearch : `/${pathWithSearch}`}`;
  }
  const path = pathWithSearch.startsWith("/") ? pathWithSearch : `/${pathWithSearch}`;
  return `${origin}${path}`;
}

export function gmailCallbackRedirectUri(env: Record<string, string | undefined> = process.env): string {
  const origin = gmailRedirectOrigin(env);
  if (!origin) throw new Error("NEXT_PUBLIC_SITE_URL is not set.");
  return `${origin}${GMAIL_CALLBACK_PATH}`;
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function oauthStateCookie(state: string, next: string, userId: string): string {
  return JSON.stringify({ h: hash(state), u: hash(userId), next });
}

function sameHash(got: string, expected: string): boolean {
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readOAuthStateCookie(
  raw: string | undefined,
  state: string | null,
  userId: string
): { next: string } | null {
  if (!raw || !state || !userId) return null;
  let parsed: { h?: unknown; u?: unknown; next?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.h !== "string" || typeof parsed.u !== "string" || typeof parsed.next !== "string") return null;
  return sameHash(parsed.h, hash(state)) && sameHash(parsed.u, hash(userId)) ? { next: parsed.next } : null;
}

export function safeInvoiceReturn(raw: string | null): string {
  if (raw && (raw.startsWith("/portal/payments") || raw.startsWith("/portal/schedule/hosted"))) return raw;
  return "/portal/payments?tab=invoices";
}

export function gmailAuthorizeUrl(state: string, env: Record<string, string | undefined> = process.env): string {
  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set("client_id", gmailClientId(env));
  url.searchParams.set("redirect_uri", gmailCallbackRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenJson = {
  refresh_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
};

export function isGmailSetupFailure(_status: number | undefined, body: string, tokenError?: string): boolean {
  const err = (tokenError ?? "").toLowerCase();
  if (err === "invalid_client") return true;
  const lower = body.toLowerCase();
  return /\binvalid_client\b/.test(lower);
}

export function isGmailAuthFailure(status: number | undefined, body: string, tokenError?: string): boolean {
  if (isGmailSetupFailure(status, body, tokenError)) return false;
  const err = (tokenError ?? "").toLowerCase();
  if (err === "invalid_grant" || err === "unauthorized_client") return true;
  if (status === 401) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("invalid_grant") ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid_token") ||
    lower.includes("token has been expired or revoked") ||
    lower.includes("unauthenticated")
  );
}

export async function exchangeGmailCode(
  code: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: gmailClientId(env),
    client_secret: gmailClientSecret(env),
    redirect_uri: gmailCallbackRedirectUri(env),
    grant_type: "authorization_code",
  });
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Google didn't return a token.");
  }
  if (!json.refresh_token) {
    throw new Error("Google didn't send a refresh token. Disconnect the app in the Google account and connect again.");
  }
  return { refreshToken: json.refresh_token, accessToken: json.access_token };
}

export async function refreshGmailAccess(
  refreshToken: string,
  env: Record<string, string | undefined> = process.env
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: gmailClientId(env),
    client_secret: gmailClientSecret(env),
    grant_type: "refresh_token",
  });
  const res = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !json.access_token) {
    const err = new Error(json.error_description || json.error || "Couldn't refresh the Gmail token.") as Error & {
      authFailed?: boolean;
      setupFailed?: boolean;
      tokenError?: string;
    };
    const detail = json.error_description || json.error || "";
    err.setupFailed = isGmailSetupFailure(res.status, detail, json.error);
    err.authFailed = !err.setupFailed && isGmailAuthFailure(res.status, detail, json.error);
    err.tokenError = json.error;
    throw err;
  }
  return json.access_token;
}

export async function gmailUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GMAIL_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = (await res.json().catch(() => ({}))) as { email?: string };
  const email = json.email?.trim();
  return email || null;
}
