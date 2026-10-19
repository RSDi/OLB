// Vercel Cron: invoice reminders. Daily. Sends only for unpaid invoices that
// are past due or coming due, on the cadence set in Finances → Invoices.
// Non-production still goes through the host mailer (test address or log).

import { NextResponse } from "next/server";
import { createInvoicingService } from "invoicing";
import { olbInvoicingAdapter } from "../../../../lib/invoicing/adapter";

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("invoice-reminders: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set; the reminder run needs it." }, { status: 500 });
  }
  return NextResponse.json(await createInvoicingService(olbInvoicingAdapter()).runReminders());
}
