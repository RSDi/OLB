/** Fail closed: no secret, or the bearer doesn't match. */
export function invoiceCronUnauthorized(authHeader: string | null, secret: string | undefined): boolean {
  return !secret || authHeader !== `Bearer ${secret}`;
}

export type InvoiceCronResult =
  | { status: 401; body: { error: string } }
  | { status: 500; body: { error: string } }
  | { status: 200; body: unknown };

/** Auth + service-role gate for GET /api/cron/invoice-reminders. */
export async function runInvoiceReminderCron(
  request: Request,
  env: Record<string, string | undefined>,
  run: () => Promise<unknown>
): Promise<InvoiceCronResult> {
  if (invoiceCronUnauthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return { status: 401, body: { error: "unauthorized" } };
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { status: 500, body: { error: "SUPABASE_SERVICE_ROLE_KEY not set; the reminder run needs it." } };
  }
  return { status: 200, body: await run() };
}
