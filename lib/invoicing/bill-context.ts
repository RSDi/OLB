// Narrow load for Bill programs. Invoicing permission may not have HS
// Schedule RLS, so this uses the admin client — but only for the weekend
// label and team fee. It does not load teams, games, money, or sent emails.

import { createAdminClient } from "../supabase/admin";

export const HOSTED_BILL_WEEKEND_COLUMNS = "id, event";
export const HOSTED_BILL_PLAN_COLUMNS = "weekend_id, hosted, short_name, team_fee_cents";

export type HostedBillContext = {
  eventLabel: string;
  feeCents: number | null;
};

export async function loadHostedBillContext(weekendId: string): Promise<HostedBillContext | null> {
  const db = createAdminClient();
  const [{ data: w }, { data: plan }] = await Promise.all([
    db.from("hs_weekends").select(HOSTED_BILL_WEEKEND_COLUMNS).eq("id", weekendId).maybeSingle(),
    db.from("hs_hosted").select(HOSTED_BILL_PLAN_COLUMNS).eq("weekend_id", weekendId).maybeSingle(),
  ]);
  if (!w || !plan || !(plan as { hosted: boolean }).hosted) return null;
  const event = (w as { event: string | null }).event;
  const short = (plan as { short_name: string | null }).short_name;
  const fee = (plan as { team_fee_cents: number | null }).team_fee_cents;
  return {
    eventLabel: short?.trim() || event?.trim() || "Tournament",
    feeCents: fee == null ? null : Number(fee),
  };
}
