// Host mailer for invoice emails. Sending is Resend from the club's verified
// domain (INVOICE_MAIL_FROM or MAIL_FROM). Reply-to is the club Gmail
// (MAIL_REPLY_TO / LightningBasketballOmaha@gmail.com). There is no Gmail API
// sending. Non-production never emails real programs: INVOICE_TEST_EMAIL or log.

import { mailFrom, mailReplyTo } from "../notifications/mail.ts";
import type { InvoiceEmail, MailSendResult } from "invoicing";

const RESEND = "https://api.resend.com/emails";

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

export async function sendInvoiceEmail(
  mail: InvoiceEmail,
  env: Record<string, string | undefined> = process.env
): Promise<MailSendResult> {
  const from = invoiceMailFrom(env);
  const replyTo = mailReplyTo(env);
  let to = unique(mail.to);
  let cc = unique(mail.cc ?? []);
  let bcc = unique(mail.bcc ?? []);
  let subject = mail.subject;
  let text = mail.text;
  let html = mail.html;
  if (!isProductionMail(env)) {
    const test = env.INVOICE_TEST_EMAIL?.trim();
    const intended = `To: ${to.join(", ") || "(none)"}${cc.length ? `\nCC: ${cc.join(", ")}` : ""}${bcc.length ? `\nBCC: ${bcc.join(", ")}` : ""}`;
    if (test) {
      console.warn(`[invoicing] non-production: redirecting ${mail.kind} for ${mail.invoiceId} to ${test} (was ${intended.replace(/\n/g, "; ")})`);
      subject = `[TEST → ${to.join(", ") || "no to"}${cc.length ? `; cc ${cc.join(", ")}` : ""}${bcc.length ? `; bcc ${bcc.join(", ")}` : ""}] ${mail.subject}`;
      text = `This is a preview send. Original recipients:\n${intended}\n\n${mail.text}`;
      html = `<p style="font-family:system-ui,sans-serif;background:#fff6cc;padding:8px 10px;border-radius:8px"><strong>Preview send.</strong> Original recipients:<br>${intended.replace(/\n/g, "<br>")}</p>${mail.html}`;
      to = [test];
      cc = [];
      bcc = [];
    } else {
      console.warn(`[invoicing] non-production: logging ${mail.kind} for ${mail.invoiceId} — ${intended.replace(/\n/g, "; ")} — not sent. Set INVOICE_TEST_EMAIL to deliver to a test inbox.`);
      return { ok: false, logged: true, error: "Not sent (logged only). Set INVOICE_TEST_EMAIL to deliver to a test inbox." };
    }
  }
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[invoicing] RESEND_API_KEY not set — invoice email not sent");
    return { ok: false, error: "Email isn't set up for the site yet, so nothing was sent." };
  }
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
