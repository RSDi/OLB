// Email Jeff when a phone-paired device is approved. Uses the same Resend
// path as the rest of the portal. No-ops without RESEND_API_KEY.

import { mailFrom, mailReplyTo } from "./mail";
import { pairingAlertEmail } from "../auth/pairing";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendPairingApprovedAlert(input: {
  pairingId: string;
  approverEmail: string;
  approverName: string;
  device: string;
  city: string | null;
  ip: string | null;
  askedAt: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping pairing-approval email");
    return;
  }

  const to = pairingAlertEmail();
  const subject = `Device signed in — ${input.device}`;
  const revokeUrl = `${siteUrl()}/portal/devices?revoke=${encodeURIComponent(input.pairingId)}`;
  const html = `
    <p>A new device was approved to sign in to the Omaha Lightning member portal.</p>
    <p>
      <strong>${escapeHtml(input.device)}</strong><br/>
      ${input.city ? `${escapeHtml(input.city)} · ` : ""}${input.ip ? escapeHtml(input.ip) : ""}<br/>
      Asked ${escapeHtml(input.askedAt)}<br/>
      Approved by ${escapeHtml(input.approverName)} (${escapeHtml(input.approverEmail)})
    </p>
    <p>
      If that wasn't you, <a href="${escapeHtml(revokeUrl)}">sign that device out</a>.
    </p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: mailFrom("OLB Portal"),
      to: [to],
      reply_to: mailReplyTo(),
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[notify] pairing-approval email failed (${res.status}): ${text.slice(0, 200)}`);
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
