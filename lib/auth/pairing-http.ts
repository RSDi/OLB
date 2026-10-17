// Shared request helpers for /api/auth/pair/* — origin check, cookies,
// no-store responses.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE_HTTP,
  DEVICE_COOKIE_HTTPS,
  DEVICE_COOKIE_MAX_AGE_S,
  PAIR_COOKIE_HTTP,
  PAIR_COOKIE_HTTPS,
  PAIR_COOKIE_MAX_AGE_S,
  cookieFlags,
  deviceCookieName,
  encodeDeviceCookie,
  encodePairCookie,
  pairCookieName,
  readPairCookie,
  type DeviceCookie,
  type PairCookie,
} from "./pairing-cookie";
import { originAllowed, requestOrigin } from "./pairing";

export function noStore(init?: ResponseInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: noStore() });
}

export function requestIsSecure(headers: Headers, fallbackUrl?: string): boolean {
  const origin = requestOrigin(headers, fallbackUrl);
  return origin.startsWith("https://");
}

export function requireSameOrigin(request: Request): NextResponse | null {
  if (originAllowed(request.headers, request.url)) return null;
  return json({ error: "wrong_host" }, 403);
}

export async function setPairCookie(cookie: PairCookie, secure: boolean): Promise<void> {
  const store = await cookies();
  store.set({
    name: pairCookieName(secure),
    value: encodePairCookie(cookie),
    ...cookieFlags(secure, PAIR_COOKIE_MAX_AGE_S),
  });
}

export async function clearPairCookies(): Promise<void> {
  const store = await cookies();
  for (const name of [PAIR_COOKIE_HTTPS, PAIR_COOKIE_HTTP]) {
    store.set({ name, value: "", ...cookieFlags(name.startsWith("__Host-"), 0) });
  }
}

export async function setDeviceCookie(cookie: DeviceCookie, secure: boolean): Promise<void> {
  const store = await cookies();
  store.set({
    name: deviceCookieName(secure),
    value: encodeDeviceCookie(cookie),
    ...cookieFlags(secure, DEVICE_COOKIE_MAX_AGE_S),
  });
}

export async function clearDeviceCookies(): Promise<void> {
  const store = await cookies();
  for (const name of [DEVICE_COOKIE_HTTPS, DEVICE_COOKIE_HTTP]) {
    store.set({ name, value: "", ...cookieFlags(name.startsWith("__Host-"), 0) });
  }
}

export async function pairCookieFromStore(): Promise<PairCookie | null> {
  const store = await cookies();
  return readPairCookie((name) => store.get(name)?.value);
}
