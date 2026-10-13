"use server";

// A tournament we host and Finances (0131, 0134): link the plan to its
// tournament in Finances (Budget → Tournaments we host), and send the plan's
// estimate to the budget, so Finances shows MRS's costs and income beside
// what's actually been paid and received. The Payments permission (the
// Treasurer); writes run with the service role after the check, like the
// rest of Finances.
//
// Each estimate line becomes a budget line (an expense, in the Events group)
// or an expected income row (revenue), tagged with the tournament.
// hs_hosted_finance remembers which, so sending again updates them. A line
// taken off the plan voids its budget line or income row, unless money has
// already been paid or received on it.

import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { latestBoard } from "../finances/club-data";
import { lineTotal, teamFee } from "./logic";
import {
  GAME_COLUMNS,
  MONEY_COLUMNS,
  PLAN_COLUMNS,
  TEAM_COLUMNS,
  type HostedGame,
  type HostedMoney,
  type HostedPlan,
  type HostedResult,
  type HostedTeam,
} from "./types";

type Admin = ReturnType<typeof createAdminClient>;

const EVENTS_GROUP = "Events";

function refresh(weekendId: string) {
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
  revalidatePath("/portal/payments");
}

async function gate(): Promise<{ db: Admin; userId: string } | { error: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  return { db: createAdminClient(), userId: g.userId };
}

async function weekendOf(db: Admin, weekendId: string) {
  const { data } = await db
    .from("hs_weekends")
    .select("id, event, starts_on, ends_on, season:hs_seasons(season)")
    .eq("id", weekendId)
    .maybeSingle();
  if (!data) return null;
  const w = data as { id: string; event: string; starts_on: string; ends_on: string; season: { season: number } | { season: number }[] | null };
  const s = Array.isArray(w.season) ? w.season[0] : w.season;
  return { ...w, season: s?.season ?? null };
}

// The season's books: the board for the HS season (2026 → "2026-2027"), else
// the newest one.
async function boardFor(db: Admin, season: number | null): Promise<string | null> {
  if (season != null) {
    const { data } = await db.from("olb_boards").select("id").eq("season", `${season}-${season + 1}`).maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  return (await latestBoard(db))?.id ?? null;
}

// Links the plan to a tournament in Finances, or ("new") adds one named and
// dated like the weekend.
export async function linkFinanceEvent(weekendId: string, eventId: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const w = await weekendOf(g.db, weekendId);
  if (!w) return { error: "That weekend isn't on the schedule any more." };
  let id = eventId;
  if (eventId === "new") {
    const boardId = await boardFor(g.db, w.season);
    if (!boardId) return { error: "There's no season set up in Finances yet." };
    const { data, error } = await g.db
      .from("olb_hosted_events")
      .insert({ board_id: boardId, name: (w.event || "Tournament").slice(0, 80), starts_on: w.starts_on, ends_on: w.ends_on })
      .select("id")
      .single();
    if (error) return { error: error.message.includes("duplicate") ? "Finances already has a tournament by that name. Pick it from the list." : error.message };
    id = (data as { id: string }).id;
  } else if (eventId) {
    const { data } = await g.db.from("olb_hosted_events").select("id").eq("id", eventId).maybeSingle();
    if (!data) return { error: "That tournament isn't in Finances any more." };
  }
  const { error } = await g.db
    .from("hs_hosted")
    .update({ finance_event_id: id || null, updated_by: g.userId })
    .eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return { notice: id ? "Linked to Finances." : "Unlinked from Finances." };
}

// Sends the plan's estimate to the budget: each cost to a budget line, each
// income (and the team fees) to an expected income row.
export async function sendToBudget(weekendId: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const db = g.db;
  const { data: p } = await db.from("hs_hosted").select(PLAN_COLUMNS).eq("weekend_id", weekendId).maybeSingle();
  const plan = p as HostedPlan | null;
  if (!plan) return { error: "Tournament planning isn't set up in the database yet (migration 0134)." };
  if (!plan.finance_event_id) return { error: "Link the tournament to Finances first." };
  const { data: ev } = await db.from("olb_hosted_events").select("id, board_id, name").eq("id", plan.finance_event_id).maybeSingle();
  const event = ev as { id: string; board_id: string; name: string } | null;
  if (!event) return { error: "That tournament isn't in Finances any more. Link it again." };
  const w = await weekendOf(db, weekendId);
  if (!w) return { error: "That weekend isn't on the schedule any more." };

  const [{ data: m }, { data: t }, { data: gm }, { data: l }] = await Promise.all([
    db.from("hs_hosted_money").select(MONEY_COLUMNS).eq("weekend_id", weekendId).order("sort_order"),
    db.from("hs_hosted_teams").select(TEAM_COLUMNS).eq("weekend_id", weekendId),
    db.from("hs_hosted_games").select(GAME_COLUMNS).eq("weekend_id", weekendId),
    db.from("hs_hosted_finance").select("money_key, budget_line_id, income_id").eq("weekend_id", weekendId),
  ]);
  const money = ((m as HostedMoney[] | null) ?? []).map((x) => ({ ...x, qty: x.qty == null ? null : Number(x.qty) }));
  const teams = (t as HostedTeam[] | null) ?? [];
  const games = (gm as HostedGame[] | null) ?? [];
  const links = new Map(
    ((l as { money_key: string; budget_line_id: string | null; income_id: string | null }[] | null) ?? []).map((x) => [x.money_key, x])
  );

  const groupId = await eventsGroup(db, event.board_id);
  if (!groupId) return { error: "Couldn't find or add the Events budget group." };
  const month = `${w.starts_on.slice(0, 7)}-01`;
  const tag = plan.short_name || event.name;
  const desc = (label: string) => `${tag}: ${label}`.slice(0, 120);
  const now = new Date().toISOString();
  let costs = 0;
  let incomes = 0;
  const kept: string[] = [];
  const problems: string[] = [];

  // What each line should be in Finances.
  const wanted: { key: string; kind: "expense" | "revenue"; category: string; description: string; cents: number }[] = money.map((x) => ({
    key: x.id,
    kind: x.kind,
    category: x.category === "sponsor" ? "sponsor" : "event",
    description: desc(x.label),
    cents: lineTotal(x, games),
  }));
  const paying = teams.filter((x) => teamFee(x, plan.team_fee_cents) > 0);
  wanted.push({
    key: "teams",
    kind: "revenue",
    category: "event",
    description: desc(`Team fees (${paying.length} ${paying.length === 1 ? "team" : "teams"})`),
    cents: teams.reduce((n, x) => n + teamFee(x, plan.team_fee_cents), 0),
  });

  for (const want of wanted) {
    const link = links.get(want.key);
    if (want.kind === "expense") {
      if (link?.budget_line_id) {
        const { error } = await db
          .from("olb_budget_lines")
          .update({ description: want.description, budget_cents: want.cents, event_id: event.id })
          .eq("id", link.budget_line_id)
          .is("voided_at", null);
        if (error) problems.push(want.description);
        else costs++;
        kept.push(want.key);
        continue;
      }
      if (want.cents <= 0) continue;
      const { data, error } = await db
        .from("olb_budget_lines")
        .insert({ board_id: event.board_id, group_id: groupId, event_id: event.id, description: want.description, month, budget_cents: want.cents, created_by: g.userId })
        .select("id")
        .single();
      if (error) {
        problems.push(want.description);
        continue;
      }
      await db.from("hs_hosted_finance").upsert({ weekend_id: weekendId, money_key: want.key, budget_line_id: (data as { id: string }).id, income_id: null, synced_at: now });
      costs++;
      kept.push(want.key);
    } else {
      if (link?.income_id) {
        // An expected row can't be $0 (0131's check): void it instead, unless money came in.
        const { data: row } = await db.from("olb_income").select("amount_cents").eq("id", link.income_id).maybeSingle();
        const received = (row as { amount_cents: number } | null)?.amount_cents ?? 0;
        if (want.cents <= 0 && received <= 0) {
          await db.from("olb_income").update({ voided_at: now, voided_by: g.userId }).eq("id", link.income_id);
          await db.from("hs_hosted_finance").delete().eq("weekend_id", weekendId).eq("money_key", want.key);
          kept.push(want.key);
          continue;
        }
        const { error } = await db
          .from("olb_income")
          .update({ description: want.description, budget_cents: want.cents > 0 ? want.cents : null, event_id: event.id })
          .eq("id", link.income_id)
          .is("voided_at", null);
        if (error) problems.push(want.description);
        else incomes++;
        kept.push(want.key);
        continue;
      }
      if (want.cents <= 0) continue;
      const { data, error } = await db
        .from("olb_income")
        .insert({
          board_id: event.board_id,
          category: want.category,
          event_id: event.id,
          description: want.description,
          amount_cents: 0,
          budget_cents: want.cents,
          recorded_by: g.userId,
        })
        .select("id")
        .single();
      if (error) {
        problems.push(want.description);
        continue;
      }
      await db.from("hs_hosted_finance").upsert({ weekend_id: weekendId, money_key: want.key, budget_line_id: null, income_id: (data as { id: string }).id, synced_at: now });
      incomes++;
      kept.push(want.key);
    }
  }

  // Lines taken off the plan since: void what nothing's been paid on.
  let voided = 0;
  for (const [key, link] of links) {
    if (kept.includes(key)) continue;
    if (link.budget_line_id) {
      const { data: pays } = await db.from("olb_expense_payments").select("id").eq("line_id", link.budget_line_id).is("voided_at", null).limit(1);
      if ((pays ?? []).length > 0) continue;
      await db.from("olb_budget_lines").update({ voided_at: now, voided_by: g.userId }).eq("id", link.budget_line_id);
    }
    if (link.income_id) {
      const { data: row } = await db.from("olb_income").select("amount_cents").eq("id", link.income_id).maybeSingle();
      if (((row as { amount_cents: number } | null)?.amount_cents ?? 0) > 0) continue;
      await db.from("olb_income").update({ voided_at: now, voided_by: g.userId }).eq("id", link.income_id);
    }
    await db.from("hs_hosted_finance").delete().eq("weekend_id", weekendId).eq("money_key", key);
    voided++;
  }
  await db.from("hs_hosted_finance").update({ synced_at: now }).eq("weekend_id", weekendId);

  refresh(weekendId);
  if (problems.length) return { error: `Updated the rest, but these didn't save: ${problems.join(", ")}.` };
  const parts = [`${costs} ${costs === 1 ? "cost" : "costs"}`, `${incomes} income ${incomes === 1 ? "line" : "lines"}`];
  return { notice: `The budget has ${parts.join(" and ")} for ${event.name}${voided ? `; ${voided} taken off` : ""}. Search ${tag} on Finances → Budget to see them.` };
}

async function eventsGroup(db: Admin, boardId: string): Promise<string | null> {
  const { data } = await db.from("olb_budget_groups").select("id, name, sort_order").eq("board_id", boardId);
  const groups = (data as { id: string; name: string; sort_order: number }[] | null) ?? [];
  const have = groups.find((x) => x.name.toLowerCase() === EVENTS_GROUP.toLowerCase());
  if (have) return have.id;
  const { data: made, error } = await db
    .from("olb_budget_groups")
    .insert({ board_id: boardId, name: EVENTS_GROUP, sort_order: Math.max(-1, ...groups.map((x) => x.sort_order)) + 1 })
    .select("id")
    .single();
  return error ? null : (made as { id: string }).id;
}
