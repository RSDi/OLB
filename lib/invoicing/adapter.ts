// OLB's implementation of the invoicing host seam. The only place that ties
// packages/invoicing to this app.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getAuthUser, getViewer } from "../auth/viewer";
import { churchToday } from "../dates/today";
import { VENMO_HANDLE, VENMO_URL } from "../teams/registration-receipt";
import { fetchStoredCheckMailing, resolveCheckMailing } from "../mail/check-address";
import { invoiceMailFrom, sendInvoiceEmail } from "./mail";
import { hostedEventCustomers } from "./customers";
import { syncHostedInvoiceSteps } from "./hosted-sync";
import { getPreview } from "../activity/preview";
import { olbInvoicePaths } from "./paths";
import { invoicePublicBaseUrl } from "./public-url";
import { loadInvoiceSettings, type InvoicingAdapter } from "invoicing";

export { olbInvoicePaths } from "./paths";

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
      return { id: user.id, email: user.email, displayName: user.email ?? "Member" };
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
      let ccEmails: string[] = [];
      let bccEmails: string[] = [];
      let stored = { payee: null as string | null, address: null as string | null };
      try {
        const db = createAdminClient();
        const settings = await loadInvoiceSettings(db);
        ccEmails = settings.ccEmails;
        bccEmails = settings.bccEmails;
        stored = await fetchStoredCheckMailing(db);
      } catch {
        // Migration not applied yet; empty is the default (never seed addresses).
      }
      const mailing = resolveCheckMailing(stored);
      return {
        fromName: "Omaha Lightning Basketball · Finance",
        fromEmail: invoiceMailFrom(),
        replyTo: process.env.MAIL_REPLY_TO?.trim() || undefined,
        venmoHandle: VENMO_HANDLE,
        venmoUrl: VENMO_URL,
        checkPayee: mailing.payee,
        checkAddress: mailing.addressLines,
        ccEmails,
        bccEmails,
      };
    },
    branding: () => ({ orgName: "Omaha Lightning Basketball", financeLabel: "Finances" }),
    paths: olbInvoicePaths,
    reminderJobPath: "/api/cron/invoice-reminders",
    listEventCustomers: hostedEventCustomers,
    async eventFeeCents(eventId: string) {
      const { data } = await createAdminClient().from("hs_hosted").select("team_fee_cents").eq("weekend_id", eventId).maybeSingle();
      const cents = (data as { team_fee_cents: number | null } | null)?.team_fee_cents;
      return cents == null ? null : Number(cents);
    },
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
    publicBaseUrl: () => invoicePublicBaseUrl(),
  };
}
