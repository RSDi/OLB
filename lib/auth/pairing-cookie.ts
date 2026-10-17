// Pairing cookies. String handling only (no Node crypto) so middleware
// can read the device-session cookie on the edge, same idea as
// lib/activity/preview-cookie.ts.
//
// Pairing (car, 3 minutes): hashed secret lives in the DB; the cookie holds
// the pairing id and the raw secret. Name is __Host-pair on HTTPS (HttpOnly,
// Secure, SameSite=Strict, Path=/, no Domain) and olb_pair on plain HTTP
// so local dev still works.
//
// Device session (car, 12 hours): same flags. Middleware uses the expiry
// stamped in the cookie so a timed-out car session ends without a database
// read. Revoke still looks the row up, but only when this cookie is present
// — normal Slack / email / password sessions never pay that cost.

export const PAIR_COOKIE_HTTPS = "__Host-pair";
export const PAIR_COOKIE_HTTP = "olb_pair";
export const DEVICE_COOKIE_HTTPS = "__Host-device";
export const DEVICE_COOKIE_HTTP = "olb_device";

export const PAIR_COOKIE_MAX_AGE_S = 180;
export const DEVICE_COOKIE_MAX_AGE_S = 12 * 60 * 60;

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

export interface PairCookie {
  id: string;
  secret: string;
}

export interface DeviceCookie {
  id: string;
  secret: string;
  expiresAt: number;
}

export function pairCookieName(secure: boolean): string {
  return secure ? PAIR_COOKIE_HTTPS : PAIR_COOKIE_HTTP;
}

export function deviceCookieName(secure: boolean): string {
  return secure ? DEVICE_COOKIE_HTTPS : DEVICE_COOKIE_HTTP;
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
  sameSite: "strict";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge,
  };
}
