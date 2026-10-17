// Phone-to-device QR pairing: codes, hashes, host binding, allowlist,
// rate-limit arithmetic, and display helpers. Pure — safe for unit tests.
// Server routes live in app/api/auth/pair/*; the car page is /login/phone
// and the phone page is /pair/[id].

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PAIR_TTL_MS = 3 * 60 * 1000;
export const DEVICE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const POLL_INTERVAL_MS = 3_000;
export const SLOW_DOWN_MS = 5_000;
export const START_WINDOW_MS = 10 * 60 * 1000;
export const START_PER_IP = 5;
export const MAX_PENDING = 20;
export const APPROVE_WINDOW_MS = 60 * 60 * 1000;
export const APPROVE_PER_HOUR = 3;

export { isPairingId, safePairNext, safeReturnTo } from "./pairing-cookie.ts";

export const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
const CODE_LEN = 8;

export const DEFAULT_PAIRING_EMAIL = "jeff@malone.net";

export type PairingStatus = "pending" | "approved" | "denied" | "expired" | "consumed" | "revoked";

export type PollError =
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token";

export function pairingSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.PAIRING_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("PAIRING_SECRET or SUPABASE_SERVICE_ROLE_KEY is required for pairing.");
  return secret;
}

export function pairingAllowedEmails(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.PAIRING_ALLOWED_EMAILS?.trim();
  const list = (raw || DEFAULT_PAIRING_EMAIL)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [DEFAULT_PAIRING_EMAIL];
}

export function canApprovePairing(
  email: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!email) return false;
  return pairingAllowedEmails(env).includes(email.trim().toLowerCase());
}

export function pairingAlertEmail(env: Record<string, string | undefined> = process.env): string {
  return env.PAIRING_ALERT_EMAIL?.trim().toLowerCase() || pairingAllowedEmails(env)[0] || DEFAULT_PAIRING_EMAIL;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function newBrowserSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hmacUserCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(`verify:${normalizeUserCode(code)}`).digest("hex");
}

export function deriveUserCode(pairingId: string, secretHash: string, secret: string): string {
  const raw = createHmac("sha256", secret).update(`code:${pairingId}:${secretHash}`).digest();
  let out = "";
  for (let i = 0; out.length < CODE_LEN; i++) {
    out += CODE_ALPHABET[raw[i % raw.length]! % CODE_ALPHABET.length];
  }
  return formatUserCode(out);
}

export function formatUserCode(raw: string): string {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, CODE_LEN);
  return `${letters.slice(0, 4)}-${letters.slice(4)}`;
}

export function normalizeUserCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z]/g, "");
}

export function isUserCode(code: string): boolean {
  const n = normalizeUserCode(code);
  return n.length === CODE_LEN && [...n].every((c) => CODE_ALPHABET.includes(c));
}

export function randomUserCode(): string {
  const bytes = randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return formatUserCode(out);
}

export function decoyCodes(real: string, count = 2): string[] {
  const used = new Set([normalizeUserCode(real)]);
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 40) {
    const next = randomUserCode();
    const key = normalizeUserCode(next);
    if (used.has(key)) continue;
    used.add(key);
    out.push(next);
  }
  return out;
}

export function shuffleCodes(codes: string[], seed: string): string[] {
  const copy = [...codes];
  let n = 0;
  for (const ch of seed) n = (n * 33 + ch.charCodeAt(0)) >>> 0;
  for (let i = copy.length - 1; i > 0; i--) {
    n = (n * 1664525 + 1013904223) >>> 0;
    const j = n % (i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export function requestHost(headers: Headers, fallbackUrl?: string): string {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwarded || headers.get("host")?.trim();
  if (host) return host.toLowerCase();
  if (fallbackUrl) {
    try {
      return new URL(fallbackUrl).host.toLowerCase();
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function requestOrigin(headers: Headers, fallbackUrl?: string): string {
  const proto = (headers.get("x-forwarded-proto") ?? (fallbackUrl?.startsWith("https:") ? "https" : "http"))
    .split(",")[0]
    .trim();
  const host = requestHost(headers, fallbackUrl);
  return host ? `${proto}://${host}` : "";
}

export function originAllowed(headers: Headers, fallbackUrl?: string): boolean {
  const expected = requestOrigin(headers, fallbackUrl);
  if (!expected) return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

export function pairUrl(origin: string, id: string): string {
  return `${origin.replace(/\/$/, "")}/pair/${id}`;
}

export function requestIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = headers.get("x-real-ip")?.trim();
  const vercel = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || real || vercel || null;
  return ip && ip.length <= 64 ? ip : null;
}

export function requestCity(headers: Headers): string | null {
  const city = headers.get("x-vercel-ip-city");
  if (!city) return null;
  try {
    return decodeURIComponent(city).slice(0, 80);
  } catch {
    return city.slice(0, 80);
  }
}

export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const tesla = /Tesla/i.test(ua);
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : tesla
                ? "Tesla"
                : /Linux/.test(ua)
                  ? "Linux"
                  : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : tesla
              ? "Tesla browser"
              : "";
  const parts = [browser, os].filter(Boolean);
  if (tesla && os && os !== "Tesla") parts.push("Tesla");
  return parts.join(" on ") || "Unknown device";
}

export function clubTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function startLimited(recentForIp: number, pendingCount: number): string | null {
  if (recentForIp >= START_PER_IP) return "Too many codes from this network. Wait a few minutes and try again.";
  if (pendingCount >= MAX_PENDING) return "Too many sign-in requests right now. Try again in a minute.";
  return null;
}

export function approveLimited(recentApprovals: number): string | null {
  if (recentApprovals >= APPROVE_PER_HOUR) {
    return "This account has approved too many devices in the last hour. Try again later.";
  }
  return null;
}

export function pollTooSoon(lastPollAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastPollAt) return false;
  const t = Date.parse(lastPollAt);
  if (!Number.isFinite(t)) return false;
  return now - t < POLL_INTERVAL_MS;
}

export function pairingExpired(expiresAt: string, now = Date.now()): boolean {
  return Date.parse(expiresAt) <= now;
}
