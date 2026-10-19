// Google OAuth for the club Gmail invoice sender. Server-only.
// gmail.send — users.messages.send (appears in the connected account's Sent).
// userinfo.email — show the connected address. gmail.send cannot read the
// mailbox, so users.getProfile (restricted) is not used.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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

export const GMAIL_RECONNECT_ERROR = "Gmail isn't connected anymore. Reconnect Gmail, then send again.";

export function gmailClientId(env: Record<string, string | undefined> = process.env): string {
  return (env.INVOICE_GMAIL_CLIENT_ID ?? "").trim();
}

export function gmailClientSecret(env: Record<string, string | undefined> = process.env): string {
  return (env.INVOICE_GMAIL_CLIENT_SECRET ?? "").trim();
}

export function gmailOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(gmailClientId(env) && gmailClientSecret(env) && (env.INVOICE_GMAIL_TOKEN_KEY ?? "").trim());
}

export function newOAuthState(): string {
  return randomBytes(24).toString("hex");
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export function oauthStateCookie(state: string, next: string): string {
  return JSON.stringify({ h: hash(state), next });
}

export function readOAuthStateCookie(raw: string | undefined, state: string | null): { next: string } | null {
  if (!raw || !state) return null;
  let parsed: { h?: unknown; next?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed.h !== "string" || typeof parsed.next !== "string") return null;
  const a = Buffer.from(parsed.h);
  const b = Buffer.from(hash(state));
  return a.length === b.length && timingSafeEqual(a, b) ? { next: parsed.next } : null;
}

export function safeInvoiceReturn(raw: string | null): string {
  if (raw && (raw.startsWith("/portal/payments") || raw.startsWith("/portal/schedule/hosted"))) return raw;
  return "/portal/payments?tab=invoices";
}

export function gmailAuthorizeUrl(origin: string, state: string, env: Record<string, string | undefined> = process.env): string {
  const url = new URL(GMAIL_AUTH_URL);
  url.searchParams.set("client_id", gmailClientId(env));
  url.searchParams.set("redirect_uri", `${origin}${GMAIL_CALLBACK_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenJson = {
  refresh_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
};

export function isGmailAuthFailure(status: number | undefined, body: string, tokenError?: string): boolean {
  const err = (tokenError ?? "").toLowerCase();
  if (err === "invalid_grant" || err === "unauthorized_client" || err === "invalid_client") return true;
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
  origin: string,
  code: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ refreshToken: string; accessToken: string }> {
  const body = new URLSearchParams({
    code,
    client_id: gmailClientId(env),
    client_secret: gmailClientSecret(env),
    redirect_uri: `${origin}${GMAIL_CALLBACK_PATH}`,
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
      tokenError?: string;
    };
    err.authFailed = isGmailAuthFailure(res.status, json.error_description || json.error || "", json.error);
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
