// Vercel Cron: invoice reminders. Daily. Sends only for unpaid invoices that
// are past due or coming due, on the cadence set in Finances → Invoices.
// Non-production still goes through the host mailer (test address or log).

import { NextResponse } from "next/server";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter } from "../../../../lib/invoicing/adapter";
import { runInvoiceReminderCron } from "../../../../lib/invoicing/cron-auth";

export async function GET(request: Request) {
  const result = await runInvoiceReminderCron(
    request,
    {
      CRON_SECRET: process.env.CRON_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    () => createInvoicingService(olbInvoicingAdapter()).runReminders()
  );
  if (result.status === 401 && !process.env.CRON_SECRET) {
    console.error("invoice-reminders: CRON_SECRET not configured");
  }
  return NextResponse.json(result.body, { status: result.status });
}
