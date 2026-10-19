// Loading a hosted tournament's planning page (0150). The plan is read as the
// viewer (RLS: the HS Schedule's planners); the programs' emails too, so a
// coach only gets the ones External Contacts shares with coaches. What
// Finances has for it is read with the service role, and only for someone
// who can see Finances (the same check the Payments page makes).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { eventCollection, listInvoices } from "invoicing";
import { hostedEventCustomers } from "../invoicing/customers";
import {
  DIVISION_COLUMNS,
  GAME_COLUMNS,
  MONEY_COLUMNS,
  PLAN_COLUMNS,
  STEP_COLUMNS,
  TEAM_COLUMNS,
  type HostedDivision,
  type HostedFinance,
  type HostedGame,
  type HostedMessage,
  type HostedMoney,
  type HostedPageData,
  type HostedPlan,
  type HostedProgram,
  type HostedStep,
  type HostedTeam,
} from "./types";

type Weekend = HostedPageData["weekend"];

// The weekend ids ticked "We host this tournament", for the schedule's
// "We host" chips. Empty before 0150 is in.
export async function loadHostedWeekendIds(supabase: SupabaseClient, weekendIds: string[]): Promise<string[]> {
  if (weekendIds.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < weekendIds.length; i += 150) {
    const { data, error } = await supabase
      .from("hs_hosted")
      .select("weekend_id")
      .eq("hosted", true)
      .in("weekend_id", weekendIds.slice(i, i + 150));
    if (error) return [];
    out.push(...((data as { weekend_id: string }[] | null) ?? []).map((r) => r.weekend_id));
  }
  return out;
}

export type HostedLoad =
  | { kind: "missing" } // no such weekend (or not the viewer's to see)
  | { kind: "migration" } // 0150 isn't in yet
  | { kind: "not_hosted"; weekend: Weekend }
  | { kind: "ok"; data: HostedPageData };

export async function loadHostedPage(
  supabase: SupabaseClient,
  weekendId: string,
  viewer: { canViewFinances: boolean; canManageFinances: boolean; canManageInvoicing?: boolean; canViewInvoices?: boolean }
): Promise<HostedLoad> {
  const { data: w } = await supabase
    .from("hs_weekends")
    .select("id, season_id, starts_on, ends_on, event, location, status, facility_contact_id, season:hs_seasons(season)")
    .eq("id", weekendId)
    .maybeSingle();
  if (!w) return { kind: "missing" };
  const raw = w as Omit<Weekend, "season"> & { season: { season: number } | { season: number }[] | null };
  const s = Array.isArray(raw.season) ? raw.season[0] : raw.season;
  const weekend: Weekend = { ...raw, season: s?.season ?? 0 };

  const { data: planRow, error: planErr } = await supabase.from("hs_hosted").select(PLAN_COLUMNS).eq("weekend_id", weekendId).maybeSingle();
  if (planErr) return { kind: "migration" };
  if (!planRow || !(planRow as HostedPlan).hosted) return { kind: "not_hosted", weekend };
  const plan = normalizePlan(planRow as HostedPlan);

  const [steps, divisions, teams, games, money, messages, programs, facilityName] = await Promise.all([
    supabase.from("hs_hosted_steps").select(STEP_COLUMNS).eq("weekend_id", weekendId).order("sort_order").then(({ data, error }) => {
      if (error) {
        return supabase
          .from("hs_hosted_steps")
          .select("id, weekend_id, section, label, due_on, done_on, note, sort_order")
          .eq("weekend_id", weekendId)
          .order("sort_order")
          .then(({ data: rows }) => ((rows as Omit<HostedStep, "step_key">[] | null) ?? []).map((s) => ({ ...s, step_key: null })));
      }
      return ((data as HostedStep[] | null) ?? []).map((s) => ({ ...s, step_key: s.step_key ?? null }));
    }),
    supabase.from("hs_hosted_divisions").select(DIVISION_COLUMNS).eq("weekend_id", weekendId).order("sort_order").then(({ data }) => (data as HostedDivision[] | null) ?? []),
    supabase.from("hs_hosted_teams").select(TEAM_COLUMNS).eq("weekend_id", weekendId).order("sort_order").then(({ data }) => (data as HostedTeam[] | null) ?? []),
    supabase.from("hs_hosted_games").select(GAME_COLUMNS).eq("weekend_id", weekendId).order("game_no").then(({ data }) => ((data as HostedGame[] | null) ?? []).map(normalizeGame)),
    supabase
      .from("hs_hosted_money")
      .select(MONEY_COLUMNS)
      .eq("weekend_id", weekendId)
      .order("sort_order")
      .then(({ data }) => ((data as HostedMoney[] | null) ?? []).map((m) => ({ ...m, qty: m.qty == null ? null : Number(m.qty) }))),
    supabase
      .from("hs_hosted_messages")
      .select("id, subject, body, sent_to, sent_count, sent_at")
      .eq("weekend_id", weekendId)
      .order("sent_at", { ascending: false })
      .limit(50)
      .then(({ data }) => (data as HostedMessage[] | null) ?? []),
    loadPrograms(supabase, weekendId),
    weekend.facility_contact_id
      ? supabase
          .from("contacts")
          .select("name")
          .eq("id", weekend.facility_contact_id)
          .maybeSingle()
          .then(({ data }) => (data as { name: string } | null)?.name ?? null)
      : Promise.resolve(null),
  ]);

  const finance = viewer.canViewFinances || viewer.canManageFinances ? await loadFinance(plan, weekend, viewer.canManageFinances).catch(() => null) : null;
  const billing = await loadBilling(supabase, weekendId, programs.length, plan.team_fee_cents, !!viewer.canManageInvoicing, !!viewer.canViewInvoices);

  return {
    kind: "ok",
    data: { weekend, facilityName, plan, steps, divisions, teams, games, money, messages, programs, finance, billing },
  };
}

async function loadBilling(
  supabase: SupabaseClient,
  weekendId: string,
  programCount: number,
  feeCents: number | null,
  canInvoice: boolean,
  canView: boolean
): Promise<HostedPageData["billing"]> {
  const empty: NonNullable<HostedPageData["billing"]> = {
    canInvoice,
    canView,
    billed: false,
    sentCount: 0,
    invoiceCount: 0,
    programCount,
    allSent: false,
    collectedCents: 0,
    billedCents: 0,
    allCollected: false,
    depositPerTeamCents: 0,
    feeCents,
  };
  if (!canView) return empty;
  try {
    const invoices = await listInvoices(supabase, weekendId);
    const expected = (await hostedEventCustomers(weekendId)).filter((c) => c.teamCount > 0).length || programCount;
    const summary = eventCollection(weekendId, invoices, expected || undefined);
    const withDeposit = invoices.filter((v) => !v.voidedAt && v.sentAt && v.depositCents > 0);
    const teams = withDeposit.reduce((s, v) => s + v.lines.reduce((n, l) => n + Math.max(0, l.qty), 0), 0);
    const depositPerTeamCents = teams > 0 ? Math.round(withDeposit.reduce((s, v) => s + v.depositCents, 0) / teams) : 0;
    return {
      canInvoice,
      canView,
      billed: summary.invoiceCount > 0,
      sentCount: summary.sentCount,
      invoiceCount: summary.invoiceCount,
      programCount: expected || programCount,
      allSent: summary.allSent,
      collectedCents: summary.collectedCents,
      billedCents: summary.billedCents,
      allCollected: summary.allCollected,
      depositPerTeamCents,
      feeCents,
    };
  } catch {
    return empty;
  }
}

function normalizePlan(p: HostedPlan): HostedPlan {
  return { ...p, days: Array.isArray(p.days) ? p.days : [] };
}

// "14:00:00" → "14:00".
function normalizeGame(g: HostedGame): HostedGame {
  return { ...g, starts_at: g.starts_at ? g.starts_at.slice(0, 5) : null };
}

// The programs coming that weekend, from the HS Schedule, each with the
// emails the viewer can see: the program's own and its people's.
async function loadPrograms(supabase: SupabaseClient, weekendId: string): Promise<HostedProgram[]> {
  const { data } = await supabase.from("hs_opponents").select("id, contact_id, name, status").eq("weekend_id", weekendId).order("sort_order");
  const opps = (data as { id: string; contact_id: string | null; name: string; status: HostedProgram["status"] }[] | null) ?? [];
  const contactIds = [...new Set(opps.map((o) => o.contact_id).filter((x): x is string => !!x))];
  const emailsOf = new Map<string, string[]>();
  const nameOf = new Map<string, string>();
  if (contactIds.length) {
    const [{ data: cs }, { data: people }] = await Promise.all([
      supabase.from("contacts").select("id, name, email, alt_email").in("id", contactIds),
      supabase.from("contacts").select("parent_contact_id, email").eq("kind", "person").in("parent_contact_id", contactIds).is("deleted_at", null),
    ]);
    for (const c of (cs as { id: string; name: string; email: string | null; alt_email: string | null }[] | null) ?? []) {
      nameOf.set(c.id, c.name);
      emailsOf.set(c.id, [c.email, c.alt_email].filter((e): e is string => !!e?.trim()));
    }
    for (const p of (people as { parent_contact_id: string; email: string | null }[] | null) ?? []) {
      if (p.email?.trim()) emailsOf.set(p.parent_contact_id, [...(emailsOf.get(p.parent_contact_id) ?? []), p.email]);
    }
  }
  const rank = { confirmed: 0, tentative: 1, declined: 2 } as const;
  const out = new Map<string, HostedProgram>();
  for (const o of opps) {
    const key = o.contact_id ?? o.name.trim().toLowerCase();
    const have = out.get(key);
    if (have) {
      have.opponent_ids.push(o.id);
      if (rank[o.status] < rank[have.status]) have.status = o.status;
      continue;
    }
    const emails = o.contact_id ? emailsOf.get(o.contact_id) ?? [] : [];
    out.set(key, {
      key,
      name: (o.contact_id && nameOf.get(o.contact_id)) || o.name,
      status: o.status,
      opponent_ids: [o.id],
      emails: [...new Set(emails.map((e) => e.trim().toLowerCase()))],
    });
  }
  return [...out.values()].sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
}

// The tournament in Finances: its budget lines (with what's been paid) and
// income rows, and the season's tournaments to link one.
async function loadFinance(plan: HostedPlan, weekend: Weekend, canManage: boolean): Promise<HostedFinance | null> {
  const db = createAdminClient();
  const season = `${weekend.season}-${weekend.season + 1}`;
  const { data: board } = await db.from("olb_boards").select("id").eq("season", season).maybeSingle();
  const boardId = (board as { id: string } | null)?.id ?? null;
  const [{ data: events, error }, { data: ev }] = await Promise.all([
    boardId
      ? db.from("olb_hosted_events").select("id, name, starts_on").eq("board_id", boardId).is("archived_at", null).order("starts_on")
      : Promise.resolve({ data: [], error: null }),
    plan.finance_event_id
      ? db.from("olb_hosted_events").select("id, name, board_id").eq("id", plan.finance_event_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (error) return null; // 0131 isn't in
  const event = (ev as HostedFinance["event"]) ?? null;
  const base: HostedFinance = {
    canManage,
    event,
    events: (events as HostedFinance["events"] | null) ?? [],
    lines: [],
    income: [],
    links: [],
  };
  if (!event) return base;
  const [{ data: lines }, { data: income }, { data: links }] = await Promise.all([
    db.from("olb_budget_lines").select("id, description, budget_cents").eq("event_id", event.id).is("voided_at", null).order("created_at"),
    db.from("olb_income").select("id, description, budget_cents, amount_cents").eq("event_id", event.id).is("voided_at", null).order("created_at"),
    db.from("hs_hosted_finance").select("money_key, budget_line_id, income_id, synced_at").eq("weekend_id", weekend.id),
  ]);
  const ls = (lines as { id: string; description: string; budget_cents: number }[] | null) ?? [];
  const paid = new Map<string, number>();
  if (ls.length) {
    const { data: pays } = await db
      .from("olb_expense_payments")
      .select("line_id, amount_cents")
      .in("line_id", ls.map((l) => l.id))
      .is("voided_at", null);
    for (const p of (pays as { line_id: string; amount_cents: number }[] | null) ?? []) paid.set(p.line_id, (paid.get(p.line_id) ?? 0) + p.amount_cents);
  }
  return {
    ...base,
    lines: ls.map((l) => ({ ...l, paid_cents: paid.get(l.id) ?? 0 })),
    income: ((income as { id: string; description: string; budget_cents: number | null; amount_cents: number }[] | null) ?? []).map((i) => ({
      ...i,
      budget_cents: i.budget_cents ?? 0,
    })),
    links: (links as HostedFinance["links"] | null) ?? [],
  };
}
