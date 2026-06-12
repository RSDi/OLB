// Server-only. Fires when a supply crosses its reorder threshold — the
// "notify us automatically when inventory reaches a certain level, and this
// is the vendor we reorder from" piece of the vision. Recipients mirror
// new-ticket.ts: super-admin emails from the DB plus the ADMIN_EMAILS env
// fallback. Gracefully no-ops without RESEND_API_KEY.

import { createAdminClient } from "../supabase/admin";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface LowStockInfo {
  supplyName: string;
  unit: string;
  onHand: number;
  threshold: number;
  vendorName?: string | null;
  vendorPhone?: string | null;
  vendorEmail?: string | null;
  reorderNote?: string | null;
}

export async function sendLowStockNotification(info: LowStockInfo) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notify] RESEND_API_KEY not set — skipping low-stock email");
    return;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[notify] SUPABASE_SERVICE_ROLE_KEY not set — skipping low-stock email");
    return;
  }

  const admin = createAdminClient();
  const { data: recipients } = await admin
    .from("members")
    .select("email")
    .eq("role", "super_admin")
    .eq("status", "approved")
    .is("deleted_at", null);
  const dbEmails = (recipients ?? []).map((r) => r.email).filter(Boolean) as string[];
  const envEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const to = Array.from(new Set([...dbEmails, ...envEmails]));
  if (to.length === 0) {
    console.warn("[notify] No recipients for low-stock alert");
    return;
  }

  const from = process.env.MAIL_FROM ?? "MCC Portal <onboarding@resend.dev>";
  const vendorLine = info.vendorName
    ? `<p><strong>Reorder from:</strong> ${escapeHtml(info.vendorName)}${
        info.vendorPhone ? ` · ${escapeHtml(info.vendorPhone)}` : ""
      }${info.vendorEmail ? ` · ${escapeHtml(info.vendorEmail)}` : ""}</p>`
    : `<p>No reorder vendor is set for this supply — add one in Settings → Supplies.</p>`;
  const noteLine = info.reorderNote
    ? `<p><strong>Reorder note:</strong> ${escapeHtml(info.reorderNote)}</p>`
    : "";

  const html = `
    <p><strong>${escapeHtml(info.supplyName)}</strong> just hit its reorder level.</p>
    <p>On hand: <strong>${info.onHand} ${escapeHtml(info.unit)}</strong> (reorder at ${info.threshold})</p>
    ${vendorLine}
    ${noteLine}
    <p><a href="${siteUrl()}/portal/settings">Manage supplies</a></p>
  `;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to,
      subject: `Low stock: ${info.supplyName} (${info.onHand} ${info.unit} left)`,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[notify] Resend low-stock email failed (${res.status}): ${text.slice(0, 200)}`);
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
