// Hosted weekends the New invoice form can bill: Event first, then programs.

import { createAdminClient } from "../supabase/admin";
import { invoiceEventsFromRows, type InvoiceEventOption } from "invoicing";

export { invoiceEventLabel, invoiceEventsFromRows } from "invoicing";
export type { InvoiceEventOption };

/** Tournaments we host, newest first. Admin client: invoicing may lack HS Schedule RLS. */
export async function listInvoiceEvents(): Promise<InvoiceEventOption[]> {
  const db = createAdminClient();
  const { data: plans, error } = await db
    .from("hs_hosted")
    .select("weekend_id, hosted, short_name, team_fee_cents")
    .eq("hosted", true);
  if (error || !plans?.length) return [];
  const ids = (plans as { weekend_id: string }[]).map((p) => p.weekend_id);
  const { data: weekends } = await db.from("hs_weekends").select("id, event, starts_on, status").in("id", ids);
  return invoiceEventsFromRows({
    plans: (plans as { weekend_id: string; hosted: boolean; short_name: string | null; team_fee_cents: number | null }[]) ?? [],
    weekends: (weekends as { id: string; event: string | null; starts_on: string; status: string }[] | null) ?? [],
  });
}
