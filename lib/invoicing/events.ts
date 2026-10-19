// Hosted weekends the New invoice form can bill: Event first, then programs.

import { createAdminClient } from "../supabase/admin";
import { invoiceEventLabel, type InvoiceEventOption } from "invoicing";

export { invoiceEventLabel };
export type { InvoiceEventOption };

export function invoiceEventsFromRows(input: {
  plans: { weekend_id: string; hosted: boolean; short_name: string | null; team_fee_cents: number | null }[];
  weekends: { id: string; event: string | null; starts_on: string; status: string }[];
}): InvoiceEventOption[] {
  const weekById = new Map(input.weekends.map((w) => [w.id, w]));
  return input.plans
    .filter((p) => p.hosted)
    .map((p) => {
      const w = weekById.get(p.weekend_id);
      if (!w || w.status === "canceled" || w.status === "off") return null;
      return {
        id: p.weekend_id,
        label: invoiceEventLabel({ shortName: p.short_name, event: w.event, startsOn: w.starts_on }),
        feeCents: p.team_fee_cents == null ? null : Number(p.team_fee_cents),
        startsOn: w.starts_on,
      };
    })
    .filter((row): row is InvoiceEventOption & { startsOn: string } => !!row)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.label.localeCompare(b.label))
    .map(({ startsOn: _startsOn, ...row }) => row);
}

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
