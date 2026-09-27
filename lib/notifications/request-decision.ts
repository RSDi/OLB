// Server-only. Emails the requester when the board approves or
// declines their request. Mirrors new-ticket.ts in shape and graceful
// degradation (no-ops if RESEND_API_KEY is missing or there's no recipient).

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendRequestDecisionNotification({
  ticketId,
  to,
  recipientName,
  decision,
  note,
  summary,
}: {
  ticketId: string;
  to: string | null;
  recipientName: string | null;
  decision: "approved" | "declined";
  note?: string | null;
  summary: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping decision email");
    return;
  }
  if (!to) {
    console.warn("[notify] No recipient email for request decision — skipping");
    return;
  }
  const from = process.env.MAIL_FROM ?? "OLB Portal <onboarding@resend.dev>";
  const hi = recipientName ? `Hi ${escapeHtml(recipientName.split(" ")[0])},` : "Hi,";

  const subject =
    decision === "approved"
      ? "Your request was approved"
      : "An update on your request";

  // The board's editable note is the message body. Fall back to a default
  // line if they left it blank (only possible on an approval).
  const lead =
    note && note.trim()
      ? escapeHtml(note).replace(/\n/g, "<br/>")
      : decision === "approved"
        ? "Good news — the board approved your request."
        : "After review, the board wasn't able to approve this request.";

  const body = `
    <p>${hi}</p>
    <p>${lead}</p>
    <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f6f6f6;border-left:3px solid #ddd;">
      ${escapeHtml(summary).replace(/\n/g, "<br/>")}
    </blockquote>
    <p><a href="${siteUrl()}/portal/tasks/${ticketId}">View your request</a></p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [to], subject, html: body }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[notify] Resend decision email failed for ${ticketId} (${res.status}): ${text.slice(0, 200)}`,
    );
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
