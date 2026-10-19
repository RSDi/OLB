// Host mailer for invoice emails. Prefer the club's connected Gmail
// (users.messages.send) when one is connected; otherwise Resend if
// RESEND_API_KEY is set; otherwise log-only. packages/invoicing never
// talks to Gmail — this file is the host side of adapter.sendEmail.
// Non-production never emails real programs: INVOICE_TEST_EMAIL or log.

import { mailFrom, mailReplyTo } from "../notifications/mail.ts";
import type { InvoiceEmail, MailSendResult } from "invoicing";
import { GMAIL_RECONNECT_ERROR, type GmailMailAccount, type GmailMailLoad } from "./gmail-meta.ts";
import { refreshGmailAccess } from "./gmail-oauth.ts";
import { sendInvoiceViaGmail, type GmailSendResult } from "./gmail-send.ts";

export type { GmailMailAccount, GmailMailLoad };

const RESEND = "https://api.resend.com/emails";

export type InvoiceMailProvider = "gmail" | "resend" | "none";

export type InvoiceMailDeps = {
  loadGmail?: (env: Record<string, string | undefined>) => Promise<GmailMailLoad>;
  refreshGmailAccess?: (refreshToken: string, env: Record<string, string | undefined>) => Promise<string>;
  sendGmail?: (input: {
    accessToken: string;
    from: string;
    replyTo: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    text: string;
    html: string;
  }) => Promise<GmailSendResult>;
  recordGmailResult?: (result: { ok: boolean; error?: string | null }) => Promise<void>;
};

export function invoiceMailFrom(env: Record<string, string | undefined> = process.env): string {
  return env.INVOICE_MAIL_FROM?.trim() || mailFrom("Omaha Lightning Basketball · Finance", env);
}

/** Live production mail only on Vercel production. A local `next start` is not live. */
export function isProductionMail(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

function unique(addrs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addrs) {
    const t = a.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Drop CC/BCC addresses already in To (and BCC already in CC), case-insensitive. */
export function assignInvoiceRecipients(
  toIn: string[],
  ccIn: string[] = [],
  bccIn: string[] = []
): { to: string[]; cc: string[]; bcc: string[] } {
  const to = unique(toIn);
  const toSet = new Set(to.map((a) => a.toLowerCase()));
  const cc = unique(ccIn).filter((a) => !toSet.has(a.toLowerCase()));
  const ccSet = new Set(cc.map((a) => a.toLowerCase()));
  const bcc = unique(bccIn).filter((a) => !toSet.has(a.toLowerCase()) && !ccSet.has(a.toLowerCase()));
  return { to, cc, bcc };
}

/** Non-production test inboxes. Comma or semicolon separated. */
export function invoiceTestRecipients(env: Record<string, string | undefined> = process.env): string[] {
  return unique((env.INVOICE_TEST_EMAIL ?? "").split(/[,;]+/));
}

export function selectInvoiceMailProvider(opts: {
  gmailConnected: boolean;
  resendConfigured: boolean;
}): InvoiceMailProvider {
  if (opts.gmailConnected) return "gmail";
  if (opts.resendConfigured) return "resend";
  return "none";
}

function gmailFrom(senderEmail: string): string {
  return `Omaha Lightning Basketball · Finance <${senderEmail}>`;
}

function gmailReplyTo(senderEmail: string, env: Record<string, string | undefined>): string {
  return env.MAIL_REPLY_TO?.trim() || senderEmail;
}

async function sendViaResend(
  env: Record<string, string | undefined>,
  apiKey: string,
  from: string,
  replyTo: string,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  text: string,
  html: string
): Promise<MailSendResult> {
  const body: Record<string, unknown> = { from, to, reply_to: replyTo, subject, text, html };
  if (cc.length) body.cc = cc;
  if (bcc.length) body.bcc = bcc;
  const res = await fetch(RESEND, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) {
    const errText = res ? await res.text().catch(() => "") : "network error";
    console.error(`[invoicing] Resend failed (${res?.status ?? "-"}) from "${from}": ${errText.slice(0, 300)}`);
    return { ok: false, error: "The email didn't go through. Try again in a minute." };
  }
  return { ok: true };
}

export async function sendInvoiceEmail(
  mail: InvoiceEmail,
  env: Record<string, string | undefined> = process.env,
  deps: InvoiceMailDeps = {}
): Promise<MailSendResult> {
  let { to, cc, bcc } = assignInvoiceRecipients(mail.to, mail.cc ?? [], mail.bcc ?? []);
  let subject = mail.subject;
  let text = mail.text;
  let html = mail.html;
  if (!isProductionMail(env)) {
    const test = invoiceTestRecipients(env);
    const intended = `To: ${to.join(", ") || "(none)"}${cc.length ? `\nCC: ${cc.join(", ")}` : ""}${bcc.length ? `\nBCC: ${bcc.join(", ")}` : ""}`;
    if (test.length) {
      console.warn(`[invoicing] non-production: redirecting ${mail.kind} for ${mail.invoiceId} to ${test.join(", ")} (was ${intended.replace(/\n/g, "; ")})`);
      subject = `[TEST → ${to.join(", ") || "no to"}${cc.length ? `; cc ${cc.join(", ")}` : ""}${bcc.length ? `; bcc ${bcc.join(", ")}` : ""}] ${mail.subject}`;
      text = `This is a preview send. Original recipients:\n${intended}\n\n${mail.text}`;
      html = `<p style="font-family:system-ui,sans-serif;background:#fff6cc;padding:8px 10px;border-radius:8px"><strong>Preview send.</strong> Original recipients:<br>${intended.replace(/\n/g, "<br>")}</p>${mail.html}`;
      to = test;
      cc = [];
      bcc = [];
    } else {
      console.warn(`[invoicing] non-production: logging ${mail.kind} for ${mail.invoiceId} — ${intended.replace(/\n/g, "; ")} — not sent. Set INVOICE_TEST_EMAIL to deliver to a test inbox.`);
      return { ok: false, logged: true, error: "Not sent (logged only). Set INVOICE_TEST_EMAIL to deliver to a test inbox." };
    }
  }

  const gmail = await resolveGmailLoad(deps, env);
  if (gmail.status === "unreadable") {
    const msg = GMAIL_RECONNECT_ERROR;
    console.error(`[invoicing] Gmail connection exists but isn't readable for ${mail.invoiceId}`);
    try {
      await deps.recordGmailResult?.({ ok: false, error: msg });
    } catch {
      // Status write is best-effort; the send still failed.
    }
    return { ok: false, error: msg };
  }
  const provider = selectInvoiceMailProvider({
    gmailConnected: gmail.status === "ready",
    resendConfigured: Boolean(env.RESEND_API_KEY?.trim()),
  });

  if (provider === "gmail" && gmail.status === "ready") {
    const from = gmailFrom(gmail.account.senderEmail);
    const replyTo = gmailReplyTo(gmail.account.senderEmail, env);
    let access: string;
    try {
      const refresh = deps.refreshGmailAccess ?? refreshGmailAccess;
      access = await refresh(gmail.account.refreshToken, env);
    } catch (err) {
      const authFailed = Boolean((err as { authFailed?: boolean } | null)?.authFailed);
      const msg = authFailed ? GMAIL_RECONNECT_ERROR : "The email didn't go through. Try again in a minute.";
      console.error(`[invoicing] Gmail token refresh failed for ${mail.invoiceId}: ${err instanceof Error ? err.message : err}`);
      try {
        await deps.recordGmailResult?.({ ok: false, error: msg });
      } catch {
        // Status write is best-effort; the send still failed.
      }
      return { ok: false, error: msg };
    }
    const send = deps.sendGmail ?? sendInvoiceViaGmail;
    const sent = await send({ accessToken: access, from, replyTo, to, cc, bcc, subject, text, html });
    if (!sent.ok) {
      const msg = sent.authFailed ? GMAIL_RECONNECT_ERROR : "The email didn't go through. Try again in a minute.";
      console.error(`[invoicing] Gmail send failed (${sent.status ?? "-"}) from "${from}": ${sent.error ?? ""}`);
      try {
        await deps.recordGmailResult?.({ ok: false, error: msg });
      } catch {
        // Status write is best-effort; the send still failed.
      }
      return { ok: false, error: msg };
    }
    try {
      await deps.recordGmailResult?.({ ok: true, error: null });
    } catch {
      // Send already succeeded; invoice can still be marked Sent.
    }
    return { ok: true };
  }

  if (provider === "resend") {
    const from = invoiceMailFrom(env);
    const replyTo = mailReplyTo(env);
    return sendViaResend(env, env.RESEND_API_KEY!.trim(), from, replyTo, to, cc, bcc, subject, text, html);
  }

  console.warn("[invoicing] no Gmail connection and RESEND_API_KEY not set — invoice email not sent");
  return { ok: false, error: "Email isn't set up for the site yet, so nothing was sent." };
}

async function resolveGmailLoad(deps: InvoiceMailDeps, env: Record<string, string | undefined>): Promise<GmailMailLoad> {
  if (!deps.loadGmail) return { status: "none" };
  try {
    return await deps.loadGmail(env);
  } catch {
    return { status: "unreadable" };
  }
}
