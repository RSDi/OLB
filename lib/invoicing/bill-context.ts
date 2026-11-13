// Narrow load for Bill programs. Invoicing permission may not have HS
// Schedule RLS, so this uses the admin client — but only for the weekend
// label and the fee per game. It does not load teams, games, money, or sent emails.

import { createAdminClient } from "../supabase/admin";

export const HOSTED_BILL_WEEKEND_COLUMNS = "id, event";
export const HOSTED_BILL_PLAN_COLUMNS = "weekend_id, hosted, short_name, game_fee_cents, games_per_team";

export type HostedBillContext = {
  eventLabel: string;
  // The fee per game.
  feeCents: number | null;
  gamesPerTeam: number;
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
  const fee = (plan as { game_fee_cents: number | null }).game_fee_cents;
  const games = (plan as { games_per_team: number | null }).games_per_team;
  return {
    eventLabel: short?.trim() || event?.trim() || "Tournament",
    feeCents: fee == null ? null : Number(fee),
    gamesPerTeam: Number(games ?? 3),
  };
}
