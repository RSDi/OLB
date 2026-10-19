// Invoice mail: non-production never emails real programs, including CC/BCC.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignInvoiceRecipients,
  invoiceMailFrom,
  invoiceTestRecipients,
  isProductionMail,
  selectInvoiceMailProvider,
  sendInvoiceEmail,
  type GmailMailAccount,
} from "../../lib/invoicing/mail.ts";
import { GMAIL_RECONNECT_ERROR } from "../../lib/invoicing/gmail-oauth.ts";
import { invoicePublicBaseUrl } from "../../lib/invoicing/public-url.ts";

const invoice = {
  to: ["program@example.com"],
  cc: ["cc@example.com"],
  bcc: ["bcc@example.com"],
  subject: "Invoice INV-1",
  text: "pay",
  html: "<p>pay</p>",
  kind: "invoice" as const,
  invoiceId: "inv-1",
};

const gmailAccount: GmailMailAccount = { refreshToken: "refresh-token", senderEmail: "club@gmail.com" };

function gmailReady() {
  return { status: "ready" as const, account: gmailAccount };
}

function gmailDeps(overrides: {
  send?: () => { ok: boolean; status?: number; error?: string; authFailed?: boolean };
  refresh?: () => Promise<string>;
  records?: { ok: boolean; error?: string | null }[];
  load?: () => Promise<{ status: "none" } | { status: "ready"; account: GmailMailAccount } | { status: "unreadable" }>;
} = {}) {
  const records = overrides.records ?? [];
  return {
    loadGmail: overrides.load ?? (async () => gmailReady()),
    refreshGmailAccess: overrides.refresh ?? (async () => "ya29.access"),
    sendGmail: async () => overrides.send?.() ?? { ok: true, status: 200 },
    recordGmailResult: async (result: { ok: boolean; error?: string | null }) => {
      records.push(result);
    },
  };
}

test("invoice from-address prefers INVOICE_MAIL_FROM, else MAIL_FROM", () => {
  assert.equal(invoiceMailFrom({ INVOICE_MAIL_FROM: "Finance <invoices@example.com>" }), "Finance <invoices@example.com>");
  assert.match(invoiceMailFrom({ MAIL_FROM: "Club <mail@example.com>" }), /mail@example.com/);
  assert.match(invoiceMailFrom({}), /onboarding@resend.dev/);
});

test("production mail is only Vercel production, not a local production build", () => {
  assert.equal(isProductionMail({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionMail({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionMail({ VERCEL_ENV: "development" }), false);
  assert.equal(isProductionMail({ NODE_ENV: "production" }), false);
  assert.equal(isProductionMail({ NODE_ENV: "production", VERCEL_ENV: "preview" }), false);
});

test("CC and BCC drop addresses already in To, case-insensitively", () => {
  const got = assignInvoiceRecipients(
    ["a@example.com", "B@example.com"],
    ["A@example.com", "cc@example.com"],
    ["b@example.com", "cc@example.com", "bcc@example.com"]
  );
  assert.deepEqual(got.to, ["a@example.com", "B@example.com"]);
  assert.deepEqual(got.cc, ["cc@example.com"]);
  assert.deepEqual(got.bcc, ["bcc@example.com"]);
});

test("INVOICE_TEST_EMAIL accepts a comma-separated list", () => {
  assert.deepEqual(invoiceTestRecipients({ INVOICE_TEST_EMAIL: "jeff@example.com, other@example.com" }), [
    "jeff@example.com",
    "other@example.com",
  ]);
});

test("preview invoice links use the current deployment URL, not production", () => {
  assert.equal(
    invoicePublicBaseUrl({
      VERCEL_ENV: "preview",
      VERCEL_BRANCH_URL: "olb-git-feat.vercel.app",
      VERCEL_URL: "olb-git-other.vercel.app",
      NEXT_PUBLIC_SITE_URL: "https://omahalightning.org",
      VERCEL_PROJECT_PRODUCTION_URL: "omahalightning.org",
    }),
    "https://olb-git-feat.vercel.app"
  );
  assert.equal(
    invoicePublicBaseUrl({
      VERCEL_ENV: "preview",
      VERCEL_URL: "olb-git-feat.vercel.app",
      NEXT_PUBLIC_SITE_URL: "https://omahalightning.org",
      VERCEL_PROJECT_PRODUCTION_URL: "omahalightning.org",
    }),
    "https://olb-git-feat.vercel.app"
  );
  assert.equal(
    invoicePublicBaseUrl({
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://omahalightning.org",
      VERCEL_URL: "olb-git-feat.vercel.app",
    }),
    "https://omahalightning.org"
  );
});

test("non-production without INVOICE_TEST_EMAIL logs and does not report success", async () => {
  const res = await sendInvoiceEmail(
    {
      to: ["program@example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      subject: "Invoice",
      text: "pay",
      html: "<p>pay</p>",
      kind: "invoice",
      invoiceId: "inv-1",
    },
    { VERCEL_ENV: "preview", RESEND_API_KEY: "re_should_not_be_used" }
  );
  assert.equal(res.ok, false);
  assert.equal(res.logged, true);
});

test("non-production with INVOICE_TEST_EMAIL redirects To/CC/BCC to the test inbox", async () => {
  const calls: unknown[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      {
        to: ["program@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Invoice INV-1",
        text: "pay",
        html: "<p>pay</p>",
        kind: "invoice",
        invoiceId: "inv-1",
      },
      { VERCEL_ENV: "preview", INVOICE_TEST_EMAIL: "jeff@example.com, other@example.com", RESEND_API_KEY: "re_test" }
    );
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    const body = calls[0] as { to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string };
    assert.deepEqual(body.to, ["jeff@example.com", "other@example.com"]);
    assert.equal(body.cc, undefined);
    assert.equal(body.bcc, undefined);
    assert.match(body.subject, /^\[TEST → /);
    assert.match(body.text, /program@example.com/);
    assert.match(body.text, /cc@example.com/);
    assert.match(body.text, /bcc@example.com/);
  } finally {
    globalThis.fetch = orig;
  }
});

test("production send without RESEND_API_KEY is not success", async () => {
  const res = await sendInvoiceEmail(
    {
      to: ["program@example.com"],
      subject: "Invoice",
      text: "pay",
      html: "<p>pay</p>",
      kind: "invoice",
      invoiceId: "inv-1",
    },
    { VERCEL_ENV: "production" }
  );
  assert.equal(res.ok, false);
  assert.match(res.error ?? "", /isn't set up/i);
});

test("production send includes CC and BCC on the Resend body", async () => {
  const calls: unknown[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    calls.push(JSON.parse(String(init?.body)));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      {
        to: ["program@example.com"],
        cc: ["cc@example.com"],
        bcc: ["bcc@example.com"],
        subject: "Invoice INV-1",
        text: "pay",
        html: "<p>pay</p>",
        kind: "invoice",
        invoiceId: "inv-1",
      },
      { VERCEL_ENV: "production", RESEND_API_KEY: "re_test", MAIL_FROM: "Club <mail@example.com>" }
    );
    assert.equal(res.ok, true);
    const body = calls[0] as { to: string[]; cc?: string[]; bcc?: string[] };
    assert.deepEqual(body.to, ["program@example.com"]);
    assert.deepEqual(body.cc, ["cc@example.com"]);
    assert.deepEqual(body.bcc, ["bcc@example.com"]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("provider is Gmail when connected, else Resend, else none", () => {
  assert.equal(selectInvoiceMailProvider({ gmailConnected: true, resendConfigured: true }), "gmail");
  assert.equal(selectInvoiceMailProvider({ gmailConnected: true, resendConfigured: false }), "gmail");
  assert.equal(selectInvoiceMailProvider({ gmailConnected: false, resendConfigured: true }), "resend");
  assert.equal(selectInvoiceMailProvider({ gmailConnected: false, resendConfigured: false }), "none");
});

test("production Gmail send is success only after the API confirms, and skips Resend", async () => {
  const records: { ok: boolean; error?: string | null }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const fail = await sendInvoiceEmail(invoice, { VERCEL_ENV: "production", RESEND_API_KEY: "re_should_not_be_used" }, gmailDeps({
      records,
      send: () => ({ ok: false, status: 500, error: "backend error" }),
    }));
    assert.equal(fail.ok, false);
    assert.equal(fail.logged, undefined);
    assert.deepEqual(records, [{ ok: false, error: "The email didn't go through. Try again in a minute." }]);

    records.length = 0;
    const ok = await sendInvoiceEmail(invoice, { VERCEL_ENV: "production", RESEND_API_KEY: "re_should_not_be_used" }, gmailDeps({ records }));
    assert.equal(ok.ok, true);
    assert.deepEqual(records, [{ ok: true, error: null }]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("production Resend send is success only after the API confirms", async () => {
  const orig = globalThis.fetch;
  let status = 500;
  globalThis.fetch = (async () => new Response("nope", { status })) as typeof fetch;
  try {
    const fail = await sendInvoiceEmail(invoice, { VERCEL_ENV: "production", RESEND_API_KEY: "re_test" });
    assert.equal(fail.ok, false);
    status = 200;
    const ok = await sendInvoiceEmail(invoice, { VERCEL_ENV: "production", RESEND_API_KEY: "re_test" });
    assert.equal(ok.ok, true);
  } finally {
    globalThis.fetch = orig;
  }
});

test("revoked Gmail token fails, keeps the send unsuccessful, and asks to reconnect", async () => {
  const records: { ok: boolean; error?: string | null }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const err = Object.assign(new Error("Token has been expired or revoked"), { authFailed: true });
    const res = await sendInvoiceEmail(
      invoice,
      { VERCEL_ENV: "production", RESEND_API_KEY: "re_should_not_be_used" },
      gmailDeps({
        records,
        refresh: async () => {
          throw err;
        },
      })
    );
    assert.equal(res.ok, false);
    assert.equal(res.error, GMAIL_RECONNECT_ERROR);
    assert.deepEqual(records, [{ ok: false, error: GMAIL_RECONNECT_ERROR }]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("production Gmail send uses the connected From and club reply-to override", async () => {
  const captured: { from: string; replyTo: string; to: string[]; cc: string[]; bcc: string[] }[] = [];
  const res = await sendInvoiceEmail(
    invoice,
    { VERCEL_ENV: "production", MAIL_REPLY_TO: "replies@example.com" },
    {
      loadGmail: async () => gmailReady(),
      refreshGmailAccess: async () => "ya29.access",
      sendGmail: async (input) => {
        captured.push(input);
        return { ok: true, status: 200 };
      },
    }
  );
  assert.equal(res.ok, true);
  assert.equal(captured[0]?.from, "Omaha Lightning Basketball · Finance <club@gmail.com>");
  assert.equal(captured[0]?.replyTo, "replies@example.com");
  assert.deepEqual(captured[0]?.to, ["program@example.com"]);
  assert.deepEqual(captured[0]?.cc, ["cc@example.com"]);
  assert.deepEqual(captured[0]?.bcc, ["bcc@example.com"]);

  const res2 = await sendInvoiceEmail(invoice, { VERCEL_ENV: "production" }, {
    loadGmail: async () => gmailReady(),
    refreshGmailAccess: async () => "ya29.access",
    sendGmail: async (input) => {
      captured.push(input);
      return { ok: true, status: 200 };
    },
  });
  assert.equal(res2.ok, true);
  assert.equal(captured[1]?.replyTo, "club@gmail.com");
});

test("mocked Google token refresh and users.messages.send", async () => {
  const urls: string[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    const u = String(url);
    urls.push(u);
    if (u.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "ya29.x" }), { status: 200 });
    }
    if (u.includes("gmail.googleapis.com/gmail/v1/users/me/messages/send")) {
      const body = JSON.parse(String(init?.body)) as { raw: string };
      const decoded = Buffer.from(body.raw, "base64url").toString("utf8");
      assert.match(decoded, /To: program@example.com/);
      assert.match(decoded, /Cc: cc@example.com/);
      assert.match(decoded, /Bcc: bcc@example.com/);
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      invoice,
      {
        VERCEL_ENV: "production",
        INVOICE_GMAIL_CLIENT_ID: "id",
        INVOICE_GMAIL_CLIENT_SECRET: "sec",
      },
      { loadGmail: async () => gmailReady() }
    );
    assert.equal(res.ok, true);
    assert.ok(urls.some((u) => u.includes("oauth2.googleapis.com/token")));
    assert.ok(urls.some((u) => u.includes("users/me/messages/send")));
  } finally {
    globalThis.fetch = orig;
  }
});

test("non-production INVOICE_TEST_EMAIL redirects To/CC/BCC through Gmail, not Resend", async () => {
  const sent: { to: string[]; cc: string[]; bcc: string[]; subject: string; text: string }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      invoice,
      { VERCEL_ENV: "preview", INVOICE_TEST_EMAIL: "jeff@example.com, other@example.com", RESEND_API_KEY: "re_should_not_be_used" },
      {
        loadGmail: async () => gmailReady(),
        refreshGmailAccess: async () => "ya29.access",
        sendGmail: async (input) => {
          sent.push(input);
          return { ok: true, status: 200 };
        },
      }
    );
    assert.equal(res.ok, true);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, ["jeff@example.com", "other@example.com"]);
    assert.deepEqual(sent[0]?.cc, []);
    assert.deepEqual(sent[0]?.bcc, []);
    assert.match(sent[0]?.subject ?? "", /^\[TEST → /);
    assert.match(sent[0]?.text ?? "", /program@example.com/);
    assert.match(sent[0]?.text ?? "", /cc@example.com/);
    assert.match(sent[0]?.text ?? "", /bcc@example.com/);
  } finally {
    globalThis.fetch = orig;
  }
});

test("unreadable Gmail connection stays Draft, records last_error, and does not use Resend", async () => {
  const records: { ok: boolean; error?: string | null }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      invoice,
      { VERCEL_ENV: "production", RESEND_API_KEY: "re_should_not_be_used" },
      gmailDeps({
        records,
        load: async () => ({ status: "unreadable" }),
      })
    );
    assert.equal(res.ok, false);
    assert.equal(res.error, GMAIL_RECONNECT_ERROR);
    assert.deepEqual(records, [{ ok: false, error: GMAIL_RECONNECT_ERROR }]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("loadGmail throw is treated as unreadable and does not use Resend", async () => {
  const records: { ok: boolean; error?: string | null }[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      invoice,
      { VERCEL_ENV: "production", RESEND_API_KEY: "re_should_not_be_used" },
      gmailDeps({
        records,
        load: async () => {
          throw new Error("decrypt failed");
        },
      })
    );
    assert.equal(res.ok, false);
    assert.equal(res.error, GMAIL_RECONNECT_ERROR);
    assert.deepEqual(records, [{ ok: false, error: GMAIL_RECONNECT_ERROR }]);
  } finally {
    globalThis.fetch = orig;
  }
});

test("no Gmail connection still uses Resend", async () => {
  const orig = globalThis.fetch;
  let usedResend = false;
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes("api.resend.com")) {
      usedResend = true;
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch ${String(url)}`);
  }) as typeof fetch;
  try {
    const res = await sendInvoiceEmail(
      invoice,
      { VERCEL_ENV: "production", RESEND_API_KEY: "re_test" },
      gmailDeps({ load: async () => ({ status: "none" }) })
    );
    assert.equal(res.ok, true);
    assert.equal(usedResend, true);
  } finally {
    globalThis.fetch = orig;
  }
});
