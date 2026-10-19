// The host seam. This package never imports host app code. A host (OLB now,
// Operations later) implements InvoicingAdapter and passes it into
// createInvoicingService().

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventCollection, EventCustomer, InvoiceEmail } from "./types";

export interface InvoicingUser {
  id: string;
  email: string | null;
  displayName: string;
}

export interface OrgSettings {
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  venmoHandle: string;
  venmoUrl: string;
  checkPayee: string;
  /** Mailing address lines from host config (e.g. MAIL_CHECK_ADDRESS). Never hard-code. */
  checkAddress: string[];
}

export interface Branding {
  orgName: string;
  financeLabel?: string;
}

export interface InvoicingPaths {
  list: string;
  detail: (id: string) => string;
  event: (eventId: string) => string;
  create: string;
  publicInvoice: (token: string) => string;
  hostedChecklist?: (eventId: string) => string;
}

export interface InvoicingAdapter {
  getServerClient(): Promise<SupabaseClient>;
  getAdminClient(): SupabaseClient;

  getCurrentUser(): Promise<InvoicingUser | null>;
  canInvoice(): Promise<boolean>;
  canViewInvoices(): Promise<boolean>;

  orgSettings(): Promise<OrgSettings>;
  branding(): Branding;
  paths: InvoicingPaths;

  /** Programs/teams to bill for a host event. Ids are opaque to this module. */
  listEventCustomers(eventId: string): Promise<EventCustomer[]>;

  /** Host ticks its own checklist when an event is fully billed/collected. */
  onEventCollectionChanged?(summary: EventCollection): Promise<void>;

  sendEmail(mail: InvoiceEmail): Promise<{ ok: boolean; error?: string }>;

  /**
   * Reminder job hook: the host's scheduler (OLB: Vercel cron at
   * `/api/cron/invoice-reminders`) calls `createInvoicingService(this).runReminders()`.
   * There is no timer inside the module.
   */
  reminderJobPath?: string;

  /** YYYY-MM-DD in the host's local timezone. */
  today(): string;

  /** Public site origin for invoice links in email. */
  publicBaseUrl(): string;
}
