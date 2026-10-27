// Hosted weekends the New invoice form can bill: Event first, then programs.

import { createAdminClient } from "../supabase/admin";
import { invoiceEventsFromRows, type InvoiceEventOption } from "invoicing";
import type { EventCustomer } from "invoicing";
import { hostedEventCustomers } from "./customers";
import { rowsOrThrow } from "./query";

export { invoiceEventLabel, invoiceEventsFromRows } from "invoicing";
export type { InvoiceEventOption };

/** Tournaments we host, newest first. Admin client: invoicing may lack HS Schedule RLS. */
export async function listInvoiceEvents(): Promise<InvoiceEventOption[]> {
  const db = createAdminClient();
  const { data: plans, error } = await db
    .from("hs_hosted")
    .select("weekend_id, hosted, short_name, team_fee_cents")
    .eq("hosted", true);
  if (error) throw new Error(error.message?.trim() || "Couldn't load registered programs.");
  if (!plans?.length) return [];
  const ids = (plans as { weekend_id: string }[]).map((p) => p.weekend_id);
  const weekends = rowsOrThrow(
    await db.from("hs_weekends").select("id, event, starts_on, status").in("id", ids)
  ) as { id: string; event: string | null; starts_on: string; status: string }[];
  return invoiceEventsFromRows({
    plans: plans as { weekend_id: string; hosted: boolean; short_name: string | null; team_fee_cents: number | null }[],
    weekends,
  });
}

export async function loadNewInvoiceFormData(): Promise<{
  events: InvoiceEventOption[];
  eventsError: boolean;
  customersByEvent: Record<string, EventCustomer[]>;
  customersErrorByEvent: Record<string, boolean>;
}> {
  let events: InvoiceEventOption[] = [];
  let eventsError = false;
  try {
    events = await listInvoiceEvents();
  } catch {
    eventsError = true;
  }
  const customersByEvent: Record<string, EventCustomer[]> = {};
  const customersErrorByEvent: Record<string, boolean> = {};
  await Promise.all(
    events.map(async (event) => {
      try {
        customersByEvent[event.id] = await hostedEventCustomers(event.id);
      } catch {
        customersByEvent[event.id] = [];
        customersErrorByEvent[event.id] = true;
      }
    })
  );
  return { events, eventsError, customersByEvent, customersErrorByEvent };
}
