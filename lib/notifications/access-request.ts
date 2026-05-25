// Server-only. Sends an email to admin members when a new access request
// arrives. Gracefully no-ops if RESEND_API_KEY is not configured, so the rest
// of the app keeps working without email set up.

import { createAdminClient } from "../supabase/admin";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendAccessRequestNotification({
  email,
  fullName,
}: {
  email: string;
  fullName: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[notify] RESEND_API_KEY not set — skipping access-request email"
    );
    return;
  }
  const from =
    process.env.MAIL_FROM ?? "MCC Portal <onboarding@resend.dev>";

  // Fetch super-admin emails. Only super-admins can approve/deny members
  // (per the Phase 1 permission matrix), so emailing anyone else would just
  // be noise. Falls back to ADMIN_EMAILS env if no DB super-admins exist yet
  // (very first deploy, before the bootstrap insert lands).
  const admin = createAdminClient();
  const { data: admins } = await admin
    .from("members")
    .select("email")
    .eq("role", "super_admin")
    .eq("status", "approved");

  const dbEmails = (admins ?? []).map((a) => a.email).filter(Boolean);
  const envEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const recipients = Array.from(
    new Set([...dbEmails, ...envEmails].map((e) => e.toLowerCase()))
  );

  if (recipients.length === 0) {
    console.warn("[notify] No admin recipients found");
    return;
  }

  const subject = `New portal access request — ${fullName ?? email}`;
  const body = `
    <p>A new request to join the Member Portal has been submitted:</p>
    <p>
      <strong>${escapeHtml(fullName ?? "(no name provided)")}</strong><br/>
      <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>
    </p>
    <p>
      Review and approve/deny in the
      <a href="${siteUrl()}/portal/settings">Members admin panel</a>.
    </p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html: body,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[notify] Resend send failed (${res.status}): ${text.slice(0, 200)}`
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
