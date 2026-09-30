// Server-only. Delivers a public-site contact form message to `to`, with
// Reply-To set to the sender. Returns false when it couldn't send, so the
// visitor is told rather than losing the message.

import type { ContactMessage } from "../contact/message";
import { mailFrom } from "./mail.ts"; // explicit extension so node --test can load this file

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendContactMessageEmail(m: ContactMessage, to: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — can't deliver contact-form message");
    return false;
  }
  const from = mailFrom();
  const name = `${m.fname} ${m.lname}`;

  const html = `
    <p><strong>${escapeHtml(name)}</strong> sent a message from the website:</p>
    <p style="white-space:pre-wrap">${escapeHtml(m.message)}</p>
    <p>Reply to this email to answer them at
      <a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>.</p>
  `;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: m.email,
        subject: `Website message from ${name}`,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[notify] Resend send failed (${res.status}): ${text.slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] Resend send failed:", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
