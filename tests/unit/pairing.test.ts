import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_ALPHABET,
  approveLimited,
  canApprovePairing,
  decoyCodes,
  DEFAULT_PAIRING_EMAIL,
  deriveUserCode,
  describeDevice,
  formatUserCode,
  hashSecret,
  hmacUserCode,
  isUserCode,
  normalizeUserCode,
  originAllowed,
  pairingAllowedEmails,
  pairingAlertEmail,
  pollTooSoon,
  randomUserCode,
  resolveReturnTo,
  safeReturnTo,
  sameHash,
  shuffleCodes,
  startLimited,
} from "../../lib/auth/pairing.ts";
import {
  cookieFlags,
  deviceCookieName,
  encodeDeviceCookie,
  encodePairCookie,
  parseDeviceCookie,
  parsePairCookie,
  pairCookieName,
  deviceCookieExpired,
  returnToCookieOptions,
} from "../../lib/auth/pairing-cookie.ts";

const SECRET = "test-pairing-secret";
const ID = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b";

test("user codes are eight letters from the no-vowel alphabet, shown as XXXX-XXXX", () => {
  const code = randomUserCode();
  assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(isUserCode(code), true);
  assert.equal(normalizeUserCode(code).length, 8);
  assert.ok([...normalizeUserCode(code)].every((c) => CODE_ALPHABET.includes(c)));
  assert.equal(formatUserCode("wdjbmjht"), "WDJB-MJHT");
});

test("the displayed code is derived and stored only as an HMAC", () => {
  const hash = hashSecret("browser-secret");
  const code = deriveUserCode(ID, hash, SECRET);
  assert.equal(isUserCode(code), true);
  assert.equal(deriveUserCode(ID, hash, SECRET), code);
  assert.notEqual(deriveUserCode(ID, hashSecret("other"), SECRET), code);
  const mac = hmacUserCode(code, SECRET);
  assert.equal(mac, hmacUserCode("wdjb-mjht".replace("wdjb-mjht", code), SECRET));
  assert.equal(sameHash(mac, hmacUserCode(normalizeUserCode(code), SECRET)), true);
  assert.equal(sameHash(mac, hmacUserCode(randomUserCode(), SECRET)), false);
});

test("the phone shows the real code among two decoys", () => {
  const real = "WDJB-MJHT";
  const decoys = decoyCodes(real, 2);
  assert.equal(decoys.length, 2);
  assert.ok(decoys.every((c) => isUserCode(c)));
  assert.ok(!decoys.some((c) => normalizeUserCode(c) === normalizeUserCode(real)));
  const shuffled = shuffleCodes([real, ...decoys], ID);
  assert.equal(shuffled.length, 3);
  assert.ok(shuffled.includes(real));
  assert.deepEqual(new Set(shuffleCodes([real, ...decoys], ID)), new Set(shuffled));
});

test("pairing cookies round-trip and reject junk", () => {
  const secret = "a".repeat(43);
  assert.deepEqual(parsePairCookie(encodePairCookie({ id: ID, secret })), { id: ID, secret });
  assert.equal(parsePairCookie("nope"), null);
  assert.equal(parsePairCookie(`${ID}.short`), null);
  const device = { id: ID, secret, expiresAt: 1_800_000_000_000 };
  assert.deepEqual(parseDeviceCookie(encodeDeviceCookie(device)), device);
  assert.equal(deviceCookieExpired(device, 1_800_000_000_001), true);
  assert.equal(deviceCookieExpired(device, 1_800_000_000_000), true);
  assert.equal(deviceCookieExpired(device, 1_799_999_999_999), false);
  assert.equal(pairCookieName(true), "olb_pair");
  assert.equal(pairCookieName(false), "olb_pair");
  assert.equal(deviceCookieName(true), "olb_device");
  assert.equal(cookieFlags(true, 180).sameSite, "lax");
  assert.equal(cookieFlags(true, 180).httpOnly, true);
  assert.equal(cookieFlags(true, 180).secure, true);
  assert.equal(returnToCookieOptions(true).sameSite, "lax");
});

test("return-to only allows a pair URL or Signed-in devices", () => {
  assert.equal(safeReturnTo(`/pair/${ID}`), `/pair/${ID}`);
  assert.equal(safeReturnTo("/portal/devices"), "/portal/devices");
  assert.equal(safeReturnTo("/portal"), null);
  assert.equal(safeReturnTo("https://evil.example/pair/" + ID), null);
  assert.equal(safeReturnTo("//evil.example"), null);
  assert.equal(safeReturnTo("/pair/not-a-uuid"), null);
  assert.equal(safeReturnTo("/login"), null);
  assert.equal(resolveReturnTo(`/pair/${ID}`, null), `/pair/${ID}`);
  assert.equal(resolveReturnTo(null, `/pair/${ID}`), `/pair/${ID}`);
  assert.equal(resolveReturnTo("/portal", `/pair/${ID}`), `/pair/${ID}`);
  assert.equal(resolveReturnTo(`/pair/${ID}`, "/portal"), `/pair/${ID}`);
  assert.equal(resolveReturnTo(null, "/portal"), null);
  assert.equal(resolveReturnTo(null, "/portal/devices"), "/portal/devices");
});

test("origin must match this host when the header is present", () => {
  const headers = new Headers({
    host: "olb.example",
    "x-forwarded-proto": "https",
    origin: "https://olb.example",
  });
  assert.equal(originAllowed(headers), true);
  assert.equal(originAllowed(new Headers({ host: "olb.example", "x-forwarded-proto": "https" })), true);
  assert.equal(
    originAllowed(new Headers({ host: "olb.example", "x-forwarded-proto": "https", origin: "https://evil.example" })),
    false
  );
});

test("start and approve rate limits, and poll slow_down", () => {
  assert.equal(startLimited(4, 19), null);
  assert.match(startLimited(5, 0) ?? "", /Too many codes/);
  assert.match(startLimited(0, 20) ?? "", /Too many sign-in requests/);
  assert.equal(approveLimited(2), null);
  assert.match(approveLimited(3) ?? "", /too many devices/);
  assert.equal(pollTooSoon(null, 10000), false);
  assert.equal(pollTooSoon(new Date(8000).toISOString(), 10000), true);
  assert.equal(pollTooSoon(new Date(6000).toISOString(), 10000), false);
});

test("allowlist defaults to Jeff's OLB admin email", () => {
  assert.deepEqual(pairingAllowedEmails({}), [DEFAULT_PAIRING_EMAIL]);
  assert.equal(DEFAULT_PAIRING_EMAIL, "jeff@malone.net");
  assert.equal(canApprovePairing("jeff@malone.net", {}), true);
  assert.equal(canApprovePairing("other@example.com", {}), false);
  assert.equal(canApprovePairing("pat@example.com", { PAIRING_ALLOWED_EMAILS: "pat@example.com" }), true);
  assert.equal(pairingAlertEmail({}), "jeff@malone.net");
  assert.equal(pairingAlertEmail({ PAIRING_ALERT_EMAIL: "ops@example.com" }), "ops@example.com");
});

test("device label mentions Tesla when the UA does", () => {
  assert.match(describeDevice("Mozilla/5.0 (X11; Linux) Tesla/2024 Chrome/120"), /Tesla/);
  assert.match(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Safari/604"), /Safari on iPhone/);
});

test("existing login methods stay on the login form", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const form = readFileSync(join(import.meta.dirname, "../../app/(site)/login/LoginForm.tsx"), "utf8");
  assert.ok(form.includes("Continue with Slack"));
  assert.ok(form.includes("Email me a sign-in code"));
  assert.ok(form.includes("Forgot password?"));
  assert.ok(form.includes("Sign in with phone"));
  assert.ok(form.includes("signInWithPassword"));
  assert.ok(form.includes("signInWithOtp"));
  assert.ok(form.includes('router.push(after ?? next ?? "/portal")'));
});
