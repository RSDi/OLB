// Host mailer for invoice emails. Uses the app's Resend setup. From-address
// is config (MAIL_FROM / INVOICE_MAIL_FROM); reply-to is the club Gmail.
// Non-production never emails real programs: INVOICE_TEST_EMAIL or log only.

import { mailFrom, mailReplyTo } from "../notifications/mail";
import type { InvoiceEmail } from "invoicing";

const RESEND = "https://api.resend.com/emails";

export function invoiceMailFrom(env: Record<string, string | undefined> = process.env): string {
  return env.INVOICE_MAIL_FROM?.trim() || mailFrom("Omaha Lightning Basketball · Finance", env);
}

export function isProductionMail(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" || (env.NODE_ENV === "production" && !env.VERCEL_ENV);
}

export async function sendInvoiceEmail(
  mail: InvoiceEmail,
  env: Record<string, string | undefined> = process.env
): Promise<{ ok: boolean; error?: string }> {
  const from = invoiceMailFrom(env);
  const replyTo = mailReplyTo(env);
  let to = mail.to;
  if (!isProductionMail(env)) {
    const test = env.INVOICE_TEST_EMAIL?.trim();
    if (test) {
      console.warn(`[invoicing] non-production: redirecting ${mail.kind} for ${mail.invoiceId} to ${test} (was ${to.join(", ")})`);
      to = [test];
    } else {
      console.warn(`[invoicing] non-production: logging ${mail.kind} for ${mail.invoiceId} to ${to.join(", ")} — not sent. Set INVOICE_TEST_EMAIL to deliver to a test inbox.`);
      return { ok: true };
    }
  }
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[invoicing] RESEND_API_KEY not set — invoice email not sent");
    return { ok: false, error: "Email isn't set up for the site yet, so nothing was sent." };
  }
  const res = await fetch(RESEND, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, reply_to: replyTo, subject: mail.subject, text: mail.text, html: mail.html }),
  }).catch(() => null);
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "network error";
    console.error(`[invoicing] Resend failed (${res?.status ?? "-"}) from "${from}": ${text.slice(0, 300)}`);
    return { ok: false, error: "The email didn't go through. Try again in a minute." };
  }
  return { ok: true };
}
