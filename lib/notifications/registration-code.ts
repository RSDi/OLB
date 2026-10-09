// Server-only. Emails the 6-digit code the public registration form asks
// for before it fills in a returning family's details (0103). Returns false
// when it can't send (no RESEND_API_KEY, or Resend refused), so the form
// carries on without it.

import { mailFrom, mailReplyTo } from "./mail";
import { loadEmailText } from "./registration-email-text";
import { codeEmail } from "../teams/registration-email-text";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendRegistrationCode({ to, code }: { to: string; code: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping registration code email");
    return false;
  }
  const from = mailFrom();
  // The words as Settings → Registration Emails left them (0127).
  const mail = codeEmail(code, await loadEmailText());
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: mailReplyTo(),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    }),
  }).catch(() => null);
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "network error";
    console.error(`[notify] Resend registration code failed (${res?.status ?? "-"}) from "${from}": ${text.slice(0, 300)}`);
    return false;
  }
  return true;
}
