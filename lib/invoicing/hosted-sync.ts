// Host callback: tick "Invoices sent" and "Team fees collected" from invoice state.

import { churchToday } from "../dates/today";
import { createAdminClient } from "../supabase/admin";
import type { EventCollection } from "invoicing";

const AUTO = new Set(["invoices_sent", "team_fees_collected"]);

export async function syncHostedInvoiceSteps(summary: EventCollection): Promise<void> {
  const weekendId = summary.eventId;
  if (!/^[0-9a-f-]{36}$/i.test(weekendId)) return;
  const db = createAdminClient();
  const { data, error } = await db
    .from("hs_hosted_steps")
    .select("id, step_key, done_on")
    .eq("weekend_id", weekendId)
    .in("step_key", [...AUTO]);
  if (error || !data) return;
  const today = churchToday();
  for (const row of data as { id: string; step_key: string; done_on: string | null }[]) {
    const done = row.step_key === "invoices_sent" ? summary.allSent : summary.allCollected;
    if (done && !row.done_on) {
      await db.from("hs_hosted_steps").update({ done_on: today, done_by: null }).eq("id", row.id);
    } else if (!done && row.done_on) {
      await db.from("hs_hosted_steps").update({ done_on: null, done_by: null }).eq("id", row.id);
    }
  }
}
