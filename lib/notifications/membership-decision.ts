// Server-only. Emails a member when a super-admin approves their
// access request — the "hey, you're in" the holding screen promises. Mirrors
// request-decision.ts in shape and graceful degradation (no-ops if
// RESEND_API_KEY is missing or there's no recipient).

import { mailFrom, mailReplyTo } from "./mail";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendMembershipApprovedNotification({
  to,
  recipientName,
}: {
  to: string | null;
  recipientName: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping membership email");
    return;
  }
  if (!to) {
    console.warn("[notify] No recipient email for membership approval — skipping");
    return;
  }
  const from = mailFrom("OLB Portal");
  const hi = recipientName ? `Hi ${escapeHtml(recipientName.split(" ")[0])},` : "Hi,";

  const body = `
    <p>${hi}</p>
    <p>Good news — your access to the Omaha Lightning Basketball member portal has been <strong>approved</strong>.</p>
    <p><a href="${siteUrl()}/login">Sign in to the portal</a> with the email and password you set up.</p>
    <p>If you have any trouble signing in, just reply to this email.</p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [to], reply_to: mailReplyTo(), subject: "You're in — Omaha Lightning member portal", html: body }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[notify] Resend membership email failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
