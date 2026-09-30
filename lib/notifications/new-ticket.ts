// Server-only. Emails super-admins plus the members of the team responsible
// for the ticket's area when a new maintenance ticket is submitted. Mirrors
// access-request.ts in shape and graceful-degradation behavior (no-ops if
// RESEND_API_KEY is missing).

import { createAdminClient } from "../supabase/admin";
import { mailFrom, mailReplyTo } from "./mail";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendNewTicketNotification({
  ticketId,
  areaId,
  submitterEmail,
  submitterName,
  areaName,
  categoryName,
  priorityLabel,
  description,
}: {
  ticketId: string;
  areaId: string | null;
  submitterEmail: string | null;
  submitterName: string | null;
  areaName: string | null;
  categoryName?: string | null;
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
  const from = mailFrom("OLB Portal");

  const admin = createAdminClient();

  // Super-admins always get a copy.
  const { data: recipients } = await admin
    .from("members")
    .select("email")
    .eq("role", "super_admin")
    .eq("status", "approved");
  const dbEmails = (recipients ?? []).map((r) => r.email).filter(Boolean);

  // Route to the members of the team responsible for this ticket's area, so the
  // people who actually cover the area hear about it (not just super-admins).
  // Two hops: area -> responsible_team_id, then that team's approved members.
  let teamEmails: (string | null)[] = [];
  if (areaId) {
    const { data: area } = await admin
      .from("areas")
      .select("responsible_team_id")
      .eq("id", areaId)
      .maybeSingle();
    const teamId =
      (area as { responsible_team_id: string | null } | null)?.responsible_team_id ?? null;
    if (teamId) {
      const { data: teamMembers } = await admin
        .from("member_volunteer_teams")
        .select("members(email, status)")
        .eq("team_id", teamId);
      teamEmails = ((teamMembers as unknown as { members: { email: string | null; status: string } | null }[]) ?? [])
        .map((tm) => tm.members)
        .filter((m): m is { email: string | null; status: string } => !!m && m.status === "approved")
        .map((m) => m.email);
    }
  }

  const envEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const to = Array.from(
    new Set(
      [...dbEmails, ...teamEmails, ...envEmails].filter(Boolean).map((e) => e!.toLowerCase())
    )
  );

  if (to.length === 0) {
    console.warn("[notify] No super-admin recipients found for new ticket");
    return;
  }

  const submitterLine = submitterName ?? submitterEmail ?? "(anonymous)";
  const subject = `New ${categoryName ?? "task"} task${areaName ? ` — ${areaName}` : ""} (${priorityLabel ?? "no priority"})`;
  const body = `
    <p>A new task has been submitted in the Member Portal:</p>
    <p>
      <strong>Category:</strong> ${escapeHtml(categoryName ?? "—")}<br/>
      <strong>Area:</strong> ${escapeHtml(areaName ?? "—")}<br/>
      <strong>Priority:</strong> ${escapeHtml(priorityLabel ?? "—")}<br/>
      <strong>Submitted by:</strong> ${escapeHtml(submitterLine)}
    </p>
    <blockquote style="margin:0 0 16px;padding:12px 16px;background:#f6f6f6;border-left:3px solid #ddd;">
      ${escapeHtml(description).replace(/\n/g, "<br/>")}
    </blockquote>
    <p><a href="${siteUrl()}/portal/tasks">View in portal</a></p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, reply_to: mailReplyTo(), subject, html: body }),
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
