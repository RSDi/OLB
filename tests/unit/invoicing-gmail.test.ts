// Connect Gmail: OAuth, encryption, SQL contract, permission gates, MIME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decryptSecret, encryptSecret, invoiceGmailTokenKey } from "../../lib/invoicing/gmail-crypto.ts";
import { gmailBannerKind, GMAIL_RECONNECT_ERROR } from "../../lib/invoicing/gmail-meta.ts";
import {
  GMAIL_CALLBACK_PATH,
  GMAIL_SCOPES,
  gmailAuthorizeUrl,
  gmailCallbackRedirectUri,
  gmailCanonicalConnectUrl,
  gmailOAuthConfigured,
  gmailRedirectOrigin,
  invoiceGmailLive,
  isGmailAuthFailure,
  readOAuthStateCookie,
  oauthStateCookie,
  refreshGmailAccess,
  safeInvoiceReturn,
} from "../../lib/invoicing/gmail-oauth.ts";
import { isMissingGmailTable } from "../../lib/invoicing/gmail-settings.ts";
import { buildGmailRawMessage, encodeRfc2047 } from "../../lib/invoicing/gmail-send.ts";
import { canManageInvoicing, type MemberLike } from "../../lib/auth/permissions.ts";

const root = join(import.meta.dirname, "../..");

const approved = (perms: string[], extra: Partial<MemberLike> = {}): MemberLike => ({
  role: "member",
  status: "approved",
  permissions: perms,
  ...extra,
});

test("Gmail refresh token encrypts with AES-GCM and a 32-byte key", () => {
  const key = invoiceGmailTokenKey({ INVOICE_GMAIL_TOKEN_KEY: "b".repeat(64) });
  assert.equal(key.length, 32);
  const packed = encryptSecret("refresh-token-value", key);
  assert.equal(packed.startsWith("v1."), true);
  assert.equal(packed.includes("refresh-token-value"), false);
  assert.equal(decryptSecret(packed, key), "refresh-token-value");
  const tag = packed.split(".")[3]!;
  assert.equal(Buffer.from(tag, "base64url").length, 16);
  assert.throws(() => decryptSecret(packed, Buffer.alloc(32, 2)));
  assert.throws(() => invoiceGmailTokenKey({}));
  assert.throws(() => invoiceGmailTokenKey({ INVOICE_GMAIL_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") }));
  assert.throws(() => invoiceGmailTokenKey({ INVOICE_GMAIL_TOKEN_KEY: "ab" }));
  const shortTag = packed.split(".");
  shortTag[3] = Buffer.from("short").toString("base64url");
  assert.throws(() => decryptSecret(shortTag.join("."), key));
});

test("OAuth authorize URL asks for gmail.send, userinfo.email, offline, and consent", () => {
  assert.equal(gmailOAuthConfigured({}), false);
  assert.equal(
    gmailOAuthConfigured({
      INVOICE_GMAIL_CLIENT_ID: "id",
      INVOICE_GMAIL_CLIENT_SECRET: "sec",
      INVOICE_GMAIL_TOKEN_KEY: "a".repeat(64),
      NEXT_PUBLIC_SITE_URL: "https://olb.example",
    }),
    true
  );
  assert.equal(
    gmailOAuthConfigured({
      INVOICE_GMAIL_CLIENT_ID: "id",
      INVOICE_GMAIL_CLIENT_SECRET: "sec",
      INVOICE_GMAIL_TOKEN_KEY: "a".repeat(64),
    }),
    false
  );
  const env = { INVOICE_GMAIL_CLIENT_ID: "client-id", NEXT_PUBLIC_SITE_URL: "https://olb.example/app" };
  const url = gmailAuthorizeUrl("state123", env);
  assert.match(url, /accounts\.google\.com/);
  assert.match(url, /access_type=offline/);
  assert.match(url, /prompt=consent/);
  assert.match(url, /gmail\.send/);
  assert.match(url, /userinfo\.email/);
  assert.match(url, /api%2Finvoicing%2Fgmail%2Fcallback/);
  assert.doesNotMatch(url, /include_granted_scopes/);
  assert.equal(gmailRedirectOrigin(env), "https://olb.example");
  assert.equal(gmailRedirectOrigin({ NEXT_PUBLIC_SITE_URL: "http://olb.example" }), null);
  assert.equal(gmailRedirectOrigin({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }), "http://localhost:3000");
  assert.equal(gmailCallbackRedirectUri(env), "https://olb.example/api/invoicing/gmail/callback");
  assert.match(url, /redirect_uri=https%3A%2F%2Folb\.example%2Fapi%2Finvoicing%2Fgmail%2Fcallback/);
  assert.equal(
    gmailCanonicalConnectUrl("https://www.olb.example", "/api/invoicing/gmail/connect?next=%2Fportal%2Fpayments", env),
    "https://olb.example/api/invoicing/gmail/connect?next=%2Fportal%2Fpayments"
  );
  assert.equal(gmailCanonicalConnectUrl("https://olb.example", "/api/invoicing/gmail/connect", env), null);
  assert.equal(GMAIL_CALLBACK_PATH, "/api/invoicing/gmail/callback");
  assert.deepEqual(GMAIL_SCOPES, [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
  ]);
  assert.ok(!GMAIL_SCOPES.some((s) => s.includes("gmail.readonly") || s.includes("gmail.modify") || s === "https://mail.google.com/"));
});

test("OAuth state cookie is bound to the state, signed-in user, and return path is invoicing-only", () => {
  const raw = oauthStateCookie("abc", "/portal/payments?tab=invoices", "user-1");
  assert.deepEqual(readOAuthStateCookie(raw, "abc", "user-1"), { next: "/portal/payments?tab=invoices" });
  assert.equal(readOAuthStateCookie(raw, "nope", "user-1"), null);
  assert.equal(readOAuthStateCookie(raw, "abc", "user-2"), null);
  assert.equal(safeInvoiceReturn("/portal/payments/invoices/xyz"), "/portal/payments/invoices/xyz");
  assert.equal(safeInvoiceReturn("https://evil.example"), "/portal/payments?tab=invoices");
  assert.equal(safeInvoiceReturn("/login"), "/portal/payments?tab=invoices");
});

test("revoked and unauthorized Google responses are auth failures", () => {
  assert.equal(isGmailAuthFailure(400, "Token has been expired or revoked", "invalid_grant"), true);
  assert.equal(isGmailAuthFailure(401, "", undefined), true);
  assert.equal(isGmailAuthFailure(500, "backend error", undefined), false);
});

test("refreshGmailAccess treats invalid_grant as a revoked token", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked" }), {
      status: 400,
    })) as typeof fetch;
  try {
    await refreshGmailAccess("rt", { INVOICE_GMAIL_CLIENT_ID: "id", INVOICE_GMAIL_CLIENT_SECRET: "sec" });
    assert.fail("expected refresh to throw");
  } catch (err) {
    assert.equal((err as { authFailed?: boolean }).authFailed, true);
  } finally {
    globalThis.fetch = orig;
  }
});

test("Gmail raw message carries From, To, CC, BCC, Reply-To, and both bodies", () => {
  const raw = buildGmailRawMessage({
    from: "Omaha Lightning Basketball · Finance <club@gmail.com>",
    replyTo: "club@gmail.com",
    to: ["program@example.com"],
    cc: ["cc@example.com"],
    bcc: ["bcc@example.com"],
    subject: "Invoice INV-1",
    text: "pay now",
    html: "<p>pay now</p>",
  });
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const encodedFrom = encodeRfc2047("Omaha Lightning Basketball · Finance");
  assert.equal(encodedFrom.startsWith("=?UTF-8?B?"), true);
  assert.ok(decoded.includes(`From: ${encodedFrom} <club@gmail.com>`));
  assert.match(decoded, /^To: program@example.com/m);
  assert.match(decoded, /^Cc: cc@example.com/m);
  assert.match(decoded, /^Bcc: bcc@example.com/m);
  assert.match(decoded, /^Reply-To: club@gmail.com/m);
  assert.match(decoded, /^Subject: Invoice INV-1/m);
  assert.match(decoded, /pay now/);
  assert.match(decoded, /<p>pay now<\/p>/);
  assert.equal(raw.includes("+"), false);
  assert.equal(raw.includes("/"), false);

  const nonAscii = buildGmailRawMessage({
    from: "Omaha Lightning Basketball · Finance <club@gmail.com>",
    replyTo: "club@gmail.com",
    to: ["program@example.com"],
    cc: [],
    bcc: [],
    subject: "Invoice · INV-1",
    text: "pay now",
    html: "<p>pay now</p>",
  });
  const decodedSubject = Buffer.from(nonAscii, "base64url").toString("utf8");
  const encodedSubject = encodeRfc2047("Invoice · INV-1");
  assert.ok(decodedSubject.includes(`Subject: ${encodedSubject}`));
  assert.equal(decodedSubject.includes("Subject: Invoice · INV-1"), false);

  const longSubject = `Invoice · ${"ñ".repeat(80)}`;
  const folded = buildGmailRawMessage({
    from: "Omaha Lightning Basketball · Finance <club@gmail.com>",
    replyTo: "club@gmail.com",
    to: ["program@example.com"],
    cc: [],
    bcc: [],
    subject: longSubject,
    text: "pay now",
    html: "<p>pay now</p>",
  });
  const decodedLong = Buffer.from(folded, "base64url").toString("utf8");
  assert.match(decodedLong, /Subject:\r\n =\?UTF-8\?B\?/);
  const encodedWords = decodedLong.match(/=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/g) ?? [];
  assert.ok(encodedWords.length >= 2);
  for (const word of encodedWords) assert.ok(word.length <= 75, word);
});

test("Reconnect banner is reconnect only for revoked/unreadable, retry for temporary errors", () => {
  assert.equal(gmailBannerKind({ connected: true, lastError: GMAIL_RECONNECT_ERROR }), "reconnect");
  assert.equal(
    gmailBannerKind({ connected: true, lastError: "The email didn't go through. Try again in a minute." }),
    "retry"
  );
  assert.equal(gmailBannerKind({ connected: true, lastError: null }), null);
  assert.equal(gmailBannerKind({ connected: false, lastError: GMAIL_RECONNECT_ERROR }), null);
});

test("Connect Gmail and Disconnect are invoicing permission only, including super_admin", () => {
  assert.equal(canManageInvoicing(approved(["invoicing"])), true);
  assert.equal(canManageInvoicing(approved(["payments"], { can_manage_finances: true })), false);
  assert.equal(canManageInvoicing(approved(["finances_view"])), false);
  assert.equal(canManageInvoicing({ role: "admin", status: "approved", permissions: [] }), false);
  assert.equal(canManageInvoicing({ role: "super_admin", status: "approved" }), true);
  assert.equal(canManageInvoicing({ role: "super_admin", status: "approved", permissions: [] }), true);

  const connect = readFileSync(join(root, "app/api/invoicing/gmail/connect/route.ts"), "utf8");
  const callback = readFileSync(join(root, "app/api/invoicing/gmail/callback/route.ts"), "utf8");
  const actions = readFileSync(join(root, "lib/invoicing/gmail-actions.ts"), "utf8");
  const card = readFileSync(join(root, "app/portal/payments/InvoicingGmailCard.tsx"), "utf8");
  const invoicePage = readFileSync(join(root, "app/portal/payments/invoices/[id]/InvoicePage.tsx"), "utf8");
  const mail = readFileSync(join(root, "lib/invoicing/mail.ts"), "utf8");
  const isolation = readFileSync(join(root, "packages/invoicing/tests/isolation.test.ts"), "utf8");
  assert.match(connect, /requireInvoicing\(\)/);
  assert.match(callback, /requireInvoicing\(\)/);
  assert.match(actions, /loadGmailSettings[\s\S]*requireInvoicing\(\)/);
  assert.match(actions, /disconnectGmailSender[\s\S]*requireInvoicing\(\)/);
  assert.doesNotMatch(connect, /requireFilmManage/);
  assert.doesNotMatch(callback, /requireFilmManage/);
  assert.match(card, /Connect Gmail/);
  assert.match(card, /super-admin/);
  assert.match(card, /only available in production/);
  assert.match(card, /Disconnect/);
  assert.match(card, /Reconnect Gmail/);
  assert.match(card, /isn&apos;t connected anymore/);
  assert.match(card, /Last send failed, Send again/);
  assert.match(invoicePage, /isn&apos;t connected anymore/);
  assert.match(invoicePage, /Last send failed, Send again/);
  assert.match(invoicePage, /Send again/);
  assert.match(invoicePage, /sendInvoiceAction/);
  assert.match(card, /Connected as/);
  assert.match(card, /Last used/);
  assert.match(mail, /packages\/invoicing never/);
  assert.match(isolation, /invoicing module core imports nothing from OLB/);
});

test("host adapter is the only Gmail seam and invoices stay Draft until mail ok", () => {
  const adapter = readFileSync(join(root, "lib/invoicing/adapter.ts"), "utf8");
  const service = readFileSync(join(root, "packages/invoicing/src/service.ts"), "utf8");
  const pkgAdapter = readFileSync(join(root, "packages/invoicing/src/adapter.ts"), "utf8");
  const pkgSrc = readFileSync(join(root, "packages/invoicing/src/index.ts"), "utf8");
  assert.match(adapter, /sendInvoiceEmail\(mail/);
  assert.match(adapter, /loadGmailForSend/);
  assert.match(adapter, /sendInvoiceViaGmail/);
  const settings = readFileSync(join(root, "lib/invoicing/gmail-settings.ts"), "utf8");
  assert.match(settings, /status: "unreadable"/);
  const mail = readFileSync(join(root, "lib/invoicing/mail.ts"), "utf8");
  assert.match(mail, /status === "unreadable"/);
  assert.doesNotMatch(mail, /loadGmail\(env\)\.catch\(\(\) => null\)/);
  const oauth = readFileSync(join(root, "lib/invoicing/gmail-oauth.ts"), "utf8");
  assert.doesNotMatch(oauth, /include_granted_scopes/);
  assert.match(oauth, /gmailRedirectOrigin/);
  const crypto = readFileSync(join(root, "lib/invoicing/gmail-crypto.ts"), "utf8");
  assert.match(crypto, /authTagLength: GCM_TAG_LENGTH/);
  assert.match(crypto, /64 hex characters/);
  const connect = readFileSync(join(root, "app/api/invoicing/gmail/connect/route.ts"), "utf8");
  const callback = readFileSync(join(root, "app/api/invoicing/gmail/callback/route.ts"), "utf8");
  assert.match(connect, /oauthStateCookie\(state, next, gate\.userId\)/);
  assert.match(callback, /readOAuthStateCookie\([\s\S]*gate\.userId/);
  assert.match(connect, /invoiceGmailLive\(\)/);
  assert.match(connect, /gmailCanonicalConnectUrl/);
  assert.match(callback, /invoiceGmailLive\(\)/);
  assert.match(settings, /invoiceGmailLive/);
  assert.match(mail, /isProductionMail\(env\) \? await resolveGmailLoad/);
  const actions = readFileSync(join(root, "lib/invoicing/gmail-actions.ts"), "utf8");
  assert.match(actions, /invoiceGmailLive\(\)/);
  assert.match(actions, /emptyGmailConnection\(\)/);
  assert.doesNotMatch(pkgAdapter, /gmail\.googleapis|INVOICE_GMAIL/);
  assert.doesNotMatch(pkgSrc, /gmail\.googleapis|INVOICE_GMAIL/);
  assert.match(service, /if \(!mailed\.ok\) return mailed/);
  assert.match(service, /sent_at: new Date\(\)\.toISOString\(\)/);
  const sendStart = service.indexOf("async send(id: string)");
  const sendFn = service.slice(sendStart, service.indexOf("async voidInvoice"));
  assert.ok(sendFn.indexOf("sendFor") < sendFn.indexOf("sent_at"));
});

test("Connect Gmail is production-only and previews never touch inv_gmail", () => {
  assert.equal(invoiceGmailLive({ VERCEL_ENV: "production" }), true);
  assert.equal(invoiceGmailLive({ VERCEL_ENV: "preview" }), false);
  assert.equal(invoiceGmailLive({ VERCEL_ENV: "development" }), false);
  assert.equal(invoiceGmailLive({ NODE_ENV: "production" }), false);
  const settings = readFileSync(join(root, "lib/invoicing/gmail-settings.ts"), "utf8");
  assert.match(settings, /if \(!invoiceGmailLive\(env\)\) return \{ status: "none" \}/);
  assert.match(settings, /if \(!invoiceGmailLive\(env\)\) return emptyGmailConnection\(\)/);
  assert.match(settings, /assertGmailLive/);
  const page = readFileSync(join(root, "app/portal/payments/invoices/[id]/page.tsx"), "utf8");
  assert.match(page, /invoiceGmailLive\(\)/);
  assert.match(settings, /isMissingGmailTable/);
});

test("missing inv_gmail table is no Gmail connected, not Reconnect", () => {
  assert.equal(isMissingGmailTable({ code: "42P01", message: 'relation "inv_gmail" does not exist' }), true);
  assert.equal(
    isMissingGmailTable({
      code: "PGRST205",
      message: "Could not find the table 'public.inv_gmail' in the schema cache",
    }),
    true
  );
  assert.equal(isMissingGmailTable({ code: "42501", message: "permission denied for table inv_gmail" }), false);
  assert.equal(isMissingGmailTable(new Error("That stored token isn't readable.")), false);
  const settings = readFileSync(join(root, "lib/invoicing/gmail-settings.ts"), "utf8");
  assert.match(settings, /if \(isMissingGmailTable\(error\)\) return null/);
  assert.match(settings, /isMissingGmailTable\(err[\s\S]*status: "none"/);
});
