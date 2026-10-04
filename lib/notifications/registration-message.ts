// Server-only. Sends messages to families from the Directory: waitlisted
// families on its Registrations page (0115), and the families of players in
// the Directory or on a player's page (0116). One email per family, through Resend: from
// MAIL_FROM, with replies to the club's Gmail. Several at once go as one
// batch request (up to 100 per request), so a whole waitlist sends quickly.

import { mailFrom, mailReplyTo } from "./mail";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const BATCH_LIMIT = 100;

export interface FamilyEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export async function sendFamilyEmails(emails: FamilyEmail[]): Promise<{ sent: number; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping registration messages");
    return { sent: 0, error: "Email isn't set up for the site yet, so nothing was sent." };
  }
  const from = mailFrom();
  const replyTo = mailReplyTo();
  const payload = (e: FamilyEmail) => ({ from, to: e.to, reply_to: replyTo, subject: e.subject, text: e.text, html: e.html });

  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_LIMIT) {
    const chunk = emails.slice(i, i + BATCH_LIMIT);
    const single = chunk.length === 1;
    const res = await fetch(single ? RESEND_ENDPOINT : `${RESEND_ENDPOINT}/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(single ? payload(chunk[0]) : chunk.map(payload)),
    }).catch(() => null);
    if (!res?.ok) {
      const text = res ? await res.text().catch(() => "") : "network error";
      console.error(`[notify] Resend registration message failed (${res?.status ?? "-"}) from "${from}": ${text.slice(0, 300)}`);
      return { sent, error: sent ? `Sent ${sent}, then the rest didn't go through. Try again for the others.` : "The email didn't go through. Try again in a minute." };
    }
    sent += chunk.length;
  }
  return { sent };
}
