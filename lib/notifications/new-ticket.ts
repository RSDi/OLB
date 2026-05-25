// Server-only. Sends an email to super-admins when a new maintenance ticket
// is submitted. Mirrors access-request.ts in shape and graceful-degradation
// behavior (no-ops if RESEND_API_KEY is missing).

import { createAdminClient } from "../supabase/admin";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendNewTicketNotification({
  ticketId,
  submitterEmail,
  submitterName,
  areaName,
  priorityLabel,
  description,
}: {
  ticketId: string;
  submitterEmail: string | null;
  submitterName: string | null;
  areaName: string | null;
  priorityLabel: string | null;
  description: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping new-ticket email");
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      "[notify] SUPABASE_SERVICE_ROLE_KEY not set — skipping new-ticket email (need it to look up super-admin recipients)"
    );
    return;
  }
  const from = process.env.MAIL_FROM ?? "MCC Portal <onboarding@resend.dev>";

  // Super-admins only per the Phase 1 permission matrix.
  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from("members")
    .select("email")
    .eq("role", "super_admin")
    .eq("status", "approved");

  const dbEmails = (recipients ?? []).map((r) => r.email).filter(Boolean);
  const envEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const to = Array.from(new Set([...dbEmails, ...envEmails].map((e) => e.toLowerCase())));

  if (to.length === 0) {
    console.warn("[notify] No super-admin recipients found for new ticket");
    return;
  }

  const submitterLine = submitterName ?? submitterEmail ?? "(anonymous)";
  const subject = `New maintenance request — ${areaName ?? "Unknown area"} (${priorityLabel ?? "no priority"})`;
  const body = `
    <p>A new maintenance request has been submitted in the Member Portal:</p>
    <p>
      <strong>Area:</strong> ${escapeHtml(areaName ?? "—")}<br/>
      <strong>Priority:</strong> ${escapeHtml(priorityLabel ?? "—")}<br/>
      <strong>Submitted by:</strong> ${escapeHtml(submitterLine)}
    </p>
    <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f6f6f6;border-left:3px solid #ddd;">
      ${escapeHtml(description).replace(/\n/g, "<br/>")}
    </blockquote>
    <p><a href="${siteUrl()}/portal/maintenance">View in portal</a></p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html: body }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[notify] Resend send failed for ticket ${ticketId} (${res.status}): ${text.slice(0, 200)}`
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
