// Club finances (0131): loading settings and the season's budget, income,
// programs and fundraising. Server-only, and runs with the service role, so
// callers check access first (requireFinances / canViewFinances), or serve
// only what the public may see (fee tiers, open programs).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "../supabase/admin";
import { seasonBoardId } from "../onboarding/server";
import { centralToday } from "./data";
import { feeTiersFrom } from "./fees";
import { groupFamilies, totalsFor } from "./logic";
import { levelsFrom, type FamilyBalances } from "./club-logic";
import { DEFAULT_REMINDER, type ReminderSettings } from "./reminders";
import {
  DEFAULT_BUDGET_GROUPS,
  DEFAULT_FUNDRAISERS,
  DEFAULT_FUNDS,
  EXPENSE_PAYMENT_COLUMNS,
  INCOME_COLUMNS,
  LINE_COLUMNS,
  PROGRAM_COLUMNS,
  SHIFT_COLUMNS,
  SIGNUP_COLUMNS,
  type BudgetGroup,
  type BudgetLine,
  type ClubData,
  type ExpensePayment,
  type FinanceSettings,
  type Fund,
  type Fundraiser,
  type HostedEvent,
  type IncomeRow,
  type Program,
  type ProgramSignup,
  type Shift,
} from "./club-types";

type Db = SupabaseClient;

export function defaultFinanceSettings(boardId: string): FinanceSettings {
  return {
    board_id: boardId,
    enabled: false,
    fee_tiers: feeTiersFrom(null),
    custom_tiers: false,
    comp_coach_kids: false,
    coach_comp_cents: null,
    fundraising_rate_cents: 1000,
    default_due_on: null,
    reminder: DEFAULT_REMINDER,
  };
}

// The season's settings; the defaults (off, built-in tiers) when none are
// saved or before 0131 is applied.
export async function loadFinanceSettings(db: Db, boardId: string): Promise<FinanceSettings> {
  const { data, error } = await db.from("olb_finance_settings").select("*").eq("board_id", boardId).maybeSingle();
  if (error || !data) return defaultFinanceSettings(boardId);
  const row = data as Omit<FinanceSettings, "custom_tiers" | "fee_tiers"> & { fee_tiers: unknown };
  const custom = Array.isArray(row.fee_tiers) && row.fee_tiers.length > 0;
  return {
    board_id: boardId,
    enabled: !!row.enabled,
    fee_tiers: feeTiersFrom(row.fee_tiers),
    custom_tiers: custom,
    comp_coach_kids: !!row.comp_coach_kids,
    coach_comp_cents: row.coach_comp_cents ?? null,
    fundraising_rate_cents: row.fundraising_rate_cents ?? 1000,
    default_due_on: row.default_due_on ?? null,
    reminder: reminderFrom(data as Record<string, unknown>),
  };
}

// The weekly reminder's columns (0133), or its defaults before they exist.
function reminderFrom(row: Record<string, unknown>): ReminderSettings {
  if (!("reminder_enabled" in row)) return DEFAULT_REMINDER;
  const roles = Array.isArray(row.reminder_roles) ? (row.reminder_roles as ReminderSettings["reminder_roles"]) : DEFAULT_REMINDER.reminder_roles;
  return {
    reminder_enabled: !!row.reminder_enabled,
    reminder_weekday: Number(row.reminder_weekday) || 1,
    reminder_start: row.reminder_start === "owing" ? "owing" : "due",
    reminder_offset_days: Number(row.reminder_offset_days) || 0,
    reminder_roles: roles,
    reminder_subject: (row.reminder_subject as string | null) ?? null,
    reminder_body: (row.reminder_body as string | null) ?? null,
  };
}

// The latest season, as Payments picks it.
export async function latestBoard(db: Db): Promise<{ id: string; season: string } | null> {
  const { data } = await db.from("olb_boards").select("id, season").order("season", { ascending: false }).limit(1).maybeSingle();
  return (data as { id: string; season: string } | null) ?? null;
}

// Whether club finances is switched on for this season. False on any error
// (0131 not applied, no season), so the pages stay as they were.
export async function financesEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const board = await latestBoard(db);
    return board ? (await loadFinanceSettings(db, board.id)).enabled : false;
  } catch {
    return false;
  }
}

// Whether 0131 is in the database at all (the Fees tab and the new charge
// categories need it).
export async function financesReady(db: Db): Promise<boolean> {
  const { error } = await db.from("olb_finance_settings").select("board_id").limit(1);
  return !error;
}

// The registration form's fee tiers, for the season it registers for.
export async function seasonFeeTiers(db: Db) {
  const boardId = await seasonBoardId(db);
  if (!boardId) return feeTiersFrom(null);
  return (await loadFinanceSettings(db, boardId)).fee_tiers;
}

// A new season's groups, the general program fund and Nelson's Produce, the
// first time the tabs open. Safe to run again.
export async function ensureDefaults(db: Db, boardId: string): Promise<void> {
  const [{ count: g }, { count: f }, { count: r }] = await Promise.all([
    db.from("olb_budget_groups").select("id", { count: "exact", head: true }).eq("board_id", boardId),
    db.from("olb_program_funds").select("id", { count: "exact", head: true }).eq("board_id", boardId),
    db.from("olb_fundraisers").select("id", { count: "exact", head: true }).eq("board_id", boardId),
  ]);
  const writes = [];
  if (!g) {
    writes.push(
      db.from("olb_budget_groups").upsert(
        DEFAULT_BUDGET_GROUPS.map((name, i) => ({ board_id: boardId, name, sort_order: (i + 1) * 10 })),
        { onConflict: "board_id,name", ignoreDuplicates: true }
      )
    );
  }
  if (!f) {
    writes.push(
      db.from("olb_program_funds").upsert(
        DEFAULT_FUNDS.map((x, i) => ({ board_id: boardId, ...x, sort_order: (i + 1) * 10 })),
        { onConflict: "board_id,name", ignoreDuplicates: true }
      )
    );
  }
  if (!r) {
    writes.push(
      db.from("olb_fundraisers").upsert(
        DEFAULT_FUNDRAISERS.map((x) => ({ board_id: boardId, ...x })),
        { onConflict: "board_id,name", ignoreDuplicates: true }
      )
    );
  }
  await Promise.all(writes);
}

// Players whose parent coaches (a leadership volunteer role on a team) this
// season: their registration fee is comped while Settings → Fees says so.
export async function coachKidIds(db: Db, boardId: string, playerIds?: string[]): Promise<Set<string>> {
  const { data: teams } = await db.from("olb_teams").select("id").eq("board_id", boardId);
  const teamIds = ((teams as { id: string }[] | null) ?? []).map((t) => t.id);
  if (teamIds.length === 0) return new Set();
  const { data: spots } = await db
    .from("olb_team_volunteers")
    .select("member_id, role:olb_volunteer_roles(is_leadership, deleted_at)")
    .in("team_id", teamIds);
  const coaches = new Set(
    ((spots as unknown as { member_id: string; role: { is_leadership: boolean; deleted_at: string | null } | null }[] | null) ?? [])
      .filter((s) => s.role?.is_leadership && !s.role.deleted_at)
      .map((s) => s.member_id)
  );
  if (coaches.size === 0) return new Set();
  let q = db.from("olb_player_parents").select("player_id, member_id").in("member_id", [...coaches]);
  if (playerIds) q = q.in("player_id", playerIds);
  const { data: links } = await q;
  const ids = ((links as { player_id: string }[] | null) ?? []).map((l) => l.player_id);
  if (ids.length === 0) return new Set();
  const { data: onBoard } = await db.from("olb_players").select("id").eq("board_id", boardId).in("id", ids);
  return new Set(((onBoard as { id: string }[] | null) ?? []).map((p) => p.id));
}

type Money = { player_id: string; kind?: string; category?: string; amount_cents: number; voided_at: string | null };

// The families' side of the season, added up by family (a credit on one kid
// offsets another's balance, as on Payments).
async function familyTotals(db: Db, boardId: string) {
  const [{ data: players }, { data: charges }, { data: payments }] = await Promise.all([
    db.from("olb_players").select("id, full_name, parents:olb_player_parents(member_id)").eq("board_id", boardId),
    db.from("olb_charges").select("player_id, kind, category, amount_cents, voided_at").eq("board_id", boardId),
    db.from("olb_payments").select("player_id, amount_cents, voided_at").eq("board_id", boardId),
  ]);
  const ps = ((players as unknown as { id: string; full_name: string; parents: { member_id: string }[] }[] | null) ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    parent_ids: (p.parents ?? []).map((x) => x.member_id),
  }));
  const cs = ((charges as Money[] | null) ?? []).map((c) => ({ ...c, kind: (c.kind ?? "charge") as "charge" | "credit" }));
  const pays = (payments as Money[] | null) ?? [];
  const all = totalsFor(
    ps.map((p) => p.id),
    cs,
    pays
  );
  let owed = 0;
  let owing = 0;
  for (const fam of groupFamilies(ps)) {
    const t = totalsFor(
      fam.map((p) => p.id),
      cs,
      pays
    );
    if (t.balance > 0) {
      owed += t.balance;
      owing += 1;
    }
  }
  const credit = (cat: string) => cs.filter((c) => !c.voided_at && c.kind === "credit" && c.category === cat).reduce((n, c) => n + c.amount_cents, 0);
  return {
    families: { charged: all.charged, credited: all.credited, paid: all.paid, owed, owing },
    credits: { fundraising: credit("fundraising"), coachComps: credit("coach_comp") },
  };
}

// Everything the Budget, Income, Programs, Fundraising and Snapshot tabs show.
export async function loadClubData(db: Db, board: { id: string; season: string }) {
  await ensureDefaults(db, board.id);
  const b = board.id;
  const [settings, groups, lines, expensePayments, income, events, programs, signups, funds, fundraisers, shifts, teams, players, totals] =
    await Promise.all([
      loadFinanceSettings(db, b),
      db.from("olb_budget_groups").select("id, name, sort_order").eq("board_id", b).order("sort_order"),
      db.from("olb_budget_lines").select(LINE_COLUMNS).eq("board_id", b).is("voided_at", null).order("month", { nullsFirst: true }).order("created_at"),
      db.from("olb_expense_payments").select(EXPENSE_PAYMENT_COLUMNS).eq("board_id", b).order("paid_on"),
      db.from("olb_income").select(INCOME_COLUMNS).eq("board_id", b).order("received_on", { nullsFirst: false }).order("created_at"),
      db.from("olb_hosted_events").select("id, name, starts_on, ends_on, note, archived_at").eq("board_id", b).order("starts_on"),
      db.from("olb_programs").select(PROGRAM_COLUMNS).eq("board_id", b).order("starts_on", { nullsFirst: false }),
      db.from("olb_program_signups").select(`${SIGNUP_COLUMNS}, charge:olb_charges(id, player_id, amount_cents, voided_at)`).eq("board_id", b).order("created_at"),
      db.from("olb_program_funds").select("id, name, description, archived_at").eq("board_id", b).order("sort_order"),
      db.from("olb_fundraisers").select("id, name, rate_cents, archived_at").eq("board_id", b).order("name"),
      db.from("olb_fundraiser_shifts").select(SHIFT_COLUMNS).eq("board_id", b).order("worked_on", { nullsFirst: true }).order("created_at"),
      db.from("olb_teams").select("id, name").eq("board_id", b).order("sort_order").order("name"),
      db.from("olb_players").select("id, full_name, team_id").eq("board_id", b).order("full_name"),
      familyTotals(db, b),
    ]);
  // A table that won't load says which, rather than the page showing
  // nothing for it.
  for (const [name, res] of Object.entries({ groups, lines, expensePayments, income, events, programs, signups, funds, fundraisers, shifts, teams, players })) {
    if (res.error) throw new Error(`Loading ${name}: ${res.error.message}`);
  }
  const lineRows = (lines.data as BudgetLine[] | null) ?? [];
  const signupRows = ((signups.data as unknown as (ProgramSignup & { charge: ClubData["signupCharges"][number] | null })[] | null) ?? []).map(
    ({ charge, ...s }) => ({ ...s, _charge: charge })
  );
  // Team costs passed on to families, found through their lines' season (a
  // list of every line's id would make the request too long to send).
  const lineCharges = await db
    .from("olb_budget_line_charges")
    .select("line_id, charge:olb_charges(id, amount_cents, voided_at), line:olb_budget_lines!inner(board_id, voided_at)")
    .eq("line.board_id", b)
    .is("line.voided_at", null);
  if (lineCharges.error) throw new Error(`Loading team costs: ${lineCharges.error.message}`);

  // The tournaments planned on the HS Schedule (0134), for a link to each
  // one's planning page. None before that migration.
  const eventRows = (events.data as HostedEvent[] | null) ?? [];
  const plans = eventRows.length
    ? await db.from("hs_hosted").select("weekend_id, finance_event_id").in("finance_event_id", eventRows.map((e) => e.id))
    : null;
  const planOf = new Map(
    plans && !plans.error ? ((plans.data as { weekend_id: string; finance_event_id: string }[] | null) ?? []).map((r) => [r.finance_event_id, r.weekend_id]) : []
  );

  const data: ClubData = {
    board,
    settings,
    groups: (groups.data as BudgetGroup[] | null) ?? [],
    lines: lineRows,
    expensePayments: (expensePayments.data as ExpensePayment[] | null) ?? [],
    lineCharges: ((lineCharges.data as unknown as { line_id: string; charge: { id: string; amount_cents: number; voided_at: string | null } | null }[] | null) ?? [])
      .filter((r) => r.charge)
      .map((r) => ({ line_id: r.line_id, charge_id: r.charge!.id, amount_cents: r.charge!.amount_cents, voided: !!r.charge!.voided_at })),
    income: (income.data as IncomeRow[] | null) ?? [],
    events: eventRows.map((e) => ({ ...e, plan_weekend_id: planOf.get(e.id) ?? null })),
    programs: ((programs.data as (Program & { levels: unknown })[] | null) ?? []).map((p) => ({ ...p, levels: levelsFrom(p.levels) })),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the charge goes in signupCharges
    signups: signupRows.map(({ _charge, ...s }) => s),
    signupCharges: signupRows.map((s) => s._charge).filter((c): c is ClubData["signupCharges"][number] => !!c),
    funds: (funds.data as Fund[] | null) ?? [],
    fundraisers: (fundraisers.data as Fundraiser[] | null) ?? [],
    shifts: ((shifts.data as (Shift & { hours: number | string })[] | null) ?? []).map((s) => ({ ...s, hours: Number(s.hours) })),
    teams: (teams.data as ClubData["teams"] | null) ?? [],
    players: (players.data as ClubData["players"] | null) ?? [],
    families: totals.families,
  };
  return { data, credits: totals.credits };
}

// Programs open for sign-up, for the public pages.
export async function openPrograms(db: Db): Promise<(Program & { taken: number })[]> {
  const board = await latestBoard(db);
  if (!board) return [];
  const settings = await loadFinanceSettings(db, board.id);
  if (!settings.enabled) return [];
  const { data } = await db.from("olb_programs").select(PROGRAM_COLUMNS).eq("board_id", board.id).eq("open", true).is("archived_at", null).order("starts_on");
  const programs = ((data as (Program & { levels: unknown })[] | null) ?? []).map((p) => ({ ...p, levels: levelsFrom(p.levels) }));
  if (programs.length === 0) return [];
  const { data: s } = await db
    .from("olb_program_signups")
    .select("program_id")
    .in(
      "program_id",
      programs.map((p) => p.id)
    )
    .is("cancelled_at", null);
  const taken = new Map<string, number>();
  for (const r of (s as { program_id: string }[] | null) ?? []) taken.set(r.program_id, (taken.get(r.program_id) ?? 0) + 1);
  return programs.map((p) => ({ ...p, taken: taken.get(p.id) ?? 0 }));
}

// A coach's kid's credit for one player, once: the comp amount, never more
// than their registration fee.
export async function compFor(db: Db, boardId: string, playerId: string, feeCents: number, compCents: number | null, userId: string | null) {
  const { data: existing } = await db
    .from("olb_charges")
    .select("id")
    .eq("player_id", playerId)
    .eq("kind", "credit")
    .eq("category", "coach_comp")
    .is("voided_at", null)
    .limit(1);
  if ((existing ?? []).length > 0) return false;
  const amount = Math.min(compCents ?? feeCents, feeCents);
  if (amount <= 0) return false;
  const { error } = await db.from("olb_charges").insert({
    board_id: boardId,
    player_id: playerId,
    kind: "credit",
    category: "coach_comp",
    description: "Coach's kid",
    amount_cents: amount,
    entry_date: centralToday(),
    created_by: userId,
  });
  return !error;
}

// Due dates on families' balances: each player's own date, else the
// season's default. Empty before 0131.
export async function loadDues(db: Db, boardId: string, playerIds?: string[]): Promise<{ dues: Record<string, string>; defaultDue: string | null }> {
  let q = db.from("olb_player_due").select("player_id, due_on").eq("board_id", boardId);
  if (playerIds) q = q.in("player_id", playerIds);
  const [{ data, error }, settings] = await Promise.all([q, loadFinanceSettings(db, boardId)]);
  const dues: Record<string, string> = {};
  if (!error) for (const r of (data as { player_id: string; due_on: string }[] | null) ?? []) dues[r.player_id] = r.due_on;
  return { dues, defaultDue: settings.default_due_on };
}

// Every player's balance this season and their brothers and sisters, for
// fundraising credits that go on down a family (familySpill).
export async function familyBalances(db: Db, boardId: string): Promise<FamilyBalances> {
  const [{ data: players }, { data: charges }, { data: payments }] = await Promise.all([
    db.from("olb_players").select("id, full_name, parents:olb_player_parents(member_id)").eq("board_id", boardId),
    db.from("olb_charges").select("player_id, kind, amount_cents, voided_at").eq("board_id", boardId),
    db.from("olb_payments").select("player_id, amount_cents, voided_at").eq("board_id", boardId),
  ]);
  const ps = ((players as unknown as { id: string; full_name: string; parents: { member_id: string }[] }[] | null) ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    parent_ids: (p.parents ?? []).map((x) => x.member_id),
  }));
  const cs = ((charges as Money[] | null) ?? []).map((c) => ({ ...c, kind: (c.kind ?? "charge") as "charge" | "credit" }));
  const pays = (payments as Money[] | null) ?? [];
  const fb: FamilyBalances = { balance: new Map(), siblings: new Map(), names: new Map() };
  for (const p of ps) {
    fb.names.set(p.id, p.full_name);
    fb.balance.set(p.id, totalsFor([p.id], cs, pays).balance);
  }
  for (const fam of groupFamilies(ps)) for (const p of fam) fb.siblings.set(p.id, fam.map((x) => x.id));
  return fb;
}
