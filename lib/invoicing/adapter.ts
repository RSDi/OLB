// OLB's implementation of the invoicing host seam. The only place that ties
// packages/invoicing to this app.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getAuthUser, getViewer } from "../auth/viewer";
import { churchToday } from "../dates/today";
import { VENMO_HANDLE, VENMO_URL, CHECK_PAYEE } from "../teams/registration-receipt";
import { invoiceMailFrom, sendInvoiceEmail } from "./mail";
import { hostedEventCustomers } from "./customers";
import { syncHostedInvoiceSteps } from "./hosted-sync";
import { getPreview } from "../activity/preview";
import { olbInvoicePaths } from "./paths";
import type { InvoicingAdapter } from "invoicing";

export { olbInvoicePaths } from "./paths";

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function olbInvoicingAdapter(): InvoicingAdapter {
  return {
    async getServerClient() {
      return createClient();
    },
    getAdminClient() {
      return createAdminClient();
    },
    async getCurrentUser() {
      const user = await getAuthUser();
      if (!user) return null;
      const viewer = await getViewer();
      return { id: user.id, email: user.email, displayName: viewer ? "Member" : user.email ?? "Member" };
    },
    async canInvoice() {
      const viewer = await getViewer();
      return !!viewer?.canManageInvoicing;
    },
    async canViewInvoices() {
      const viewer = await getViewer();
      return !!viewer?.canViewInvoices;
    },
    async orgSettings() {
      const checkAddress = (process.env.MAIL_CHECK_ADDRESS ?? "").split("|").map((s) => s.trim()).filter(Boolean);
      return {
        fromName: "Omaha Lightning Basketball · Finance",
        fromEmail: invoiceMailFrom(),
        replyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
        venmoHandle: VENMO_HANDLE,
        venmoUrl: VENMO_URL,
        checkPayee: CHECK_PAYEE,
        checkAddress,
      };
    },
    branding: () => ({ orgName: "Omaha Lightning Basketball", financeLabel: "Finances" }),
    paths: olbInvoicePaths,
    reminderJobPath: "/api/cron/invoice-reminders",
    listEventCustomers: hostedEventCustomers,
    onEventCollectionChanged: syncHostedInvoiceSteps,
    async sendEmail(mail) {
      try {
        if (await getPreview()) return { ok: false, error: "Can't send while previewing as someone." };
      } catch {
        // Cron and other non-page callers have no preview cookie.
      }
      return sendInvoiceEmail(mail);
    },
    today: () => churchToday(),
    publicBaseUrl: siteUrl,
  };
}
