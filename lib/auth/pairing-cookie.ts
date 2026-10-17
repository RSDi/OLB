// Pairing cookies. String handling only (no Node crypto) so middleware
// can read the device-session cookie on the edge, same idea as
// lib/activity/preview-cookie.ts.
//
// Pairing (car, 3 minutes): hashed secret lives in the DB; the cookie holds
// the pairing id and the raw secret. Prod 10/16: the same flow works in a
// MacBook browser and fails in Tesla Chromium. Tesla rejects __Host- cookies,
// drops SameSite=Strict, and often ignores Set-Cookie on the fetch poll
// response, so we write olb_pair / olb_device (HttpOnly, Secure on HTTPS,
// SameSite=Lax, Path=/). Leftover __Host- names are still read and cleared.
//
// Device session (car, 12 hours): same flags. Middleware uses the expiry
// stamped in the cookie so a timed-out car session ends without a database
// read. Revoke still looks the row up, but only when this cookie is present
// — normal Slack / email / password sessions never pay that cost.
//
// Return-to (phone, 10 minutes): olb_return_to holds a safe /pair/<id> (or
// /portal/devices) so Slack OAuth and the emailed magic-link can strip ?next=
// and still send the phone back to Approve instead of /portal.

export const PAIR_COOKIE_HTTPS = "__Host-pair";
export const PAIR_COOKIE_HTTP = "olb_pair";
export const DEVICE_COOKIE_HTTPS = "__Host-device";
export const DEVICE_COOKIE_HTTP = "olb_device";
export const RETURN_TO_COOKIE = "olb_return_to";

export const PAIR_COOKIE_MAX_AGE_S = 180;
export const DEVICE_COOKIE_MAX_AGE_S = 12 * 60 * 60;
export const RETURN_TO_MAX_AGE_S = 10 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
const PAIR_NEXT_RE = /^\/pair\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPairingId(id: string): boolean {
  return UUID.test(id);
}

export function safePairNext(raw: string | null | undefined): string | null {
  if (!raw || raw.includes("\\") || raw.includes("\n") || raw.includes("\r")) return null;
  return PAIR_NEXT_RE.test(raw) ? raw : null;
}

export function safeReturnTo(raw: string | null | undefined): string | null {
  const pair = safePairNext(raw);
  if (pair) return pair;
  return raw === "/portal/devices" ? raw : null;
}

// Query wins when it's a safe path; otherwise the short-lived return-to
// cookie. Slack and the emailed magic-link often drop ?next=.
export function resolveReturnTo(
  queryNext: string | null | undefined,
  cookieNext?: string | null
): string | null {
  return safeReturnTo(queryNext) ?? safeReturnTo(cookieNext);
}

export interface PairCookie {
  id: string;
  secret: string;
}

export interface DeviceCookie {
  id: string;
  secret: string;
  expiresAt: number;
}

export function pairCookieName(_secure?: boolean): string {
  return PAIR_COOKIE_HTTP;
}

export function deviceCookieName(_secure?: boolean): string {
  return DEVICE_COOKIE_HTTP;
}

export function encodePairCookie(c: PairCookie): string {
  return `${c.id}.${c.secret}`;
}

export function parsePairCookie(raw: string | null | undefined): PairCookie | null {
  if (!raw) return null;
  const i = raw.indexOf(".");
  if (i < 1) return null;
  const id = raw.slice(0, i);
  const secret = raw.slice(i + 1);
  if (!UUID.test(id) || !SECRET.test(secret)) return null;
  return { id, secret };
}

export function encodeDeviceCookie(c: DeviceCookie): string {
  return `${c.id}.${c.secret}.${c.expiresAt}`;
}

export function parseDeviceCookie(raw: string | null | undefined): DeviceCookie | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [id, secret, exp] = parts;
  const expiresAt = Number(exp);
  if (!UUID.test(id) || !SECRET.test(secret) || !Number.isSafeInteger(expiresAt)) return null;
  return { id, secret, expiresAt };
}

export function deviceCookieExpired(c: DeviceCookie, now = Date.now()): boolean {
  return c.expiresAt <= now;
}

export function readPairCookie(
  get: (name: string) => string | undefined
): PairCookie | null {
  return parsePairCookie(get(PAIR_COOKIE_HTTPS)) ?? parsePairCookie(get(PAIR_COOKIE_HTTP));
}

export function readDeviceCookie(
  get: (name: string) => string | undefined
): DeviceCookie | null {
  return parseDeviceCookie(get(DEVICE_COOKIE_HTTPS)) ?? parseDeviceCookie(get(DEVICE_COOKIE_HTTP));
}

export function cookieFlags(secure: boolean, maxAge: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function returnToCookieOptions(secure: boolean, maxAge = RETURN_TO_MAX_AGE_S): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return cookieFlags(secure, maxAge);
}

export function requestIsHttps(headers: Headers, protocol?: string): boolean {
  if (headers.get("x-forwarded-proto") === "https") return true;
  return protocol === "https:";
}
