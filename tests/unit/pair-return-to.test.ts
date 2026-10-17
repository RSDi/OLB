// Phone QR return-to + Tesla car session: source-lock the login, callback,
// poll, and car-page paths so a scan cannot drop the user on /portal.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

function src(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

test("unauthenticated /pair redirects to /login with a return-to and stashes it", () => {
  const mw = src("middleware.ts");
  assert.ok(mw.includes('path.startsWith("/pair/")'));
  assert.ok(mw.includes("safeReturnTo(path)"));
  assert.ok(mw.includes('?next=${encodeURIComponent(next)}'));
  assert.ok(mw.includes("rememberReturnTo"));
  assert.ok(mw.includes("RETURN_TO_COOKIE"));
  assert.ok(mw.includes("loginNext"));
});

test("Slack OAuth and emailed-code magic-link both pass next to /auth/callback", () => {
  const form = src("app/(site)/login/LoginForm.tsx");
  assert.ok(form.includes("authCallbackUrl"));
  assert.ok(form.includes("/auth/callback?next="));
  assert.ok(form.includes("signInWithOAuth"));
  assert.ok(form.includes("emailRedirectTo"));
  assert.ok(form.includes("authCallbackUrl()"));
  assert.ok(form.includes('router.push(after ?? next ?? "/portal")'));
  assert.ok(form.includes("signInWithPassword"));
  assert.ok(form.includes("signInWithOtp"));
  assert.ok(form.includes("verifyOtp"));
});

test("auth callback reads next from the query or the return-to cookie", () => {
  const cb = src("app/auth/callback/route.ts");
  assert.ok(cb.includes("resolveReturnTo"));
  assert.ok(cb.includes("RETURN_TO_COOKIE"));
  assert.ok(cb.includes("searchParams.get(\"next\")"));
  assert.ok(cb.includes("store.get(RETURN_TO_COOKIE)"));
  assert.ok(!cb.includes("safeReturnTo(next) ?? \"/portal\""));
});

test("car cookies avoid Tesla Chromium traps (__Host-, Strict, fetch-only session)", () => {
  const cookies = src("lib/auth/pairing-cookie.ts");
  assert.ok(cookies.includes('return PAIR_COOKIE_HTTP'));
  assert.ok(cookies.includes('return DEVICE_COOKIE_HTTP'));
  assert.ok(cookies.includes('sameSite: "lax"'));
  assert.ok(!cookies.includes('sameSite: "strict"'));
  const start = src("app/api/auth/pair/start/route.ts");
  assert.ok(start.includes("secret,"));
  const poll = src("app/api/auth/pair/poll/route.ts");
  assert.ok(poll.includes("access_token: minted.accessToken"));
  assert.ok(poll.includes("refresh_token: minted.refreshToken"));
  assert.ok(poll.includes("body.secret"));
  assert.ok(poll.includes("parsePairCookie"));
  const car = src("app/(site)/login/phone/PhonePairScreen.tsx");
  assert.ok(car.includes("setSession"));
  assert.ok(car.includes("window.location.assign(\"/portal\")"));
  assert.ok(!car.includes("router.push(\"/portal\")"));
  assert.ok(car.includes("secretRef"));
});
