"use server";

// Server actions for a tournament we host (0150): the checklist, divisions
// and teams, brackets and pools, filling the courts, the budget estimate and
// the email to the programs coming. The HS Schedule's planners (coaches and
// the board: requireHsPlanner, and RLS from 0150) — everything runs as the
// viewer. Sending the estimate to Finances is ./finance-actions.ts.

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import { requireHsPlanner } from "../hs-schedule/guard";
import { getPreview } from "../activity/preview";
import { sendFamilyEmails } from "../notifications/registration-message";
import { messageHtml } from "../teams/family-mail";
import { parseAmount } from "../finances/logic";
import {
  DEFAULT_STEPS,
  advance,
  cleanDays,
  daysForWeekend,
  feeLockSaveError,
  fillCourts,
  hostedTeamInvoiceKeys,
  initials,
  hostedStepBillingKey,
  isBillingStep,
  parseCount,
  placementBracket,
  placesLabel,
  planFeeChanged,
  roundRobin,
  seeded,
  slotsFor,
  toMinutes,
  uncheckBillProgramsError,
  type Side,
} from "./logic";
import {
  GAME_COLUMNS,
  PLAN_COLUMNS,
  STEP_SECTIONS,
  TEAM_COLUMNS,
  type DivisionFormat,
  type HostedDivision,
  type HostedGame,
  type HostedPlan,
  type HostedResult,
  type HostedTeam,
  type MoneyCategory,
  type MoneyKind,
  type StepSection,
} from "./types";
import { loadFeeLockState, loadHostedPage } from "./data";

type Db = Awaited<ReturnType<typeof createClient>>;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MIGRATION = "Tournament planning isn't set up in the database yet (migration 0150).";

function refresh(weekendId: string) {
  revalidatePath(`/portal/schedule/hosted/${weekendId}`);
}

function text(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function longText(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

async function gate(): Promise<{ db: Db; userId: string } | { error: string }> {
  const g = await requireHsPlanner();
  if ("error" in g) return { error: g.error };
  return { db: await createClient(), userId: g.userId };
}

async function nextOrder(db: Db, table: string, weekendId: string): Promise<number> {
  const { data } = await db.from(table).select("sort_order").eq("weekend_id", weekendId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  return ((data as { sort_order: number } | null)?.sort_order ?? -1) + 1;
}

// ─── Hosting a weekend ──────────────────────────────────────────────────────

// Ticks "We host this tournament" on a weekend: its planning page, starting
// with the usual checklist and the spreadsheet's revenue and expense lines.
// Ticking it again later brings back the plan as it was.
export async function setHosted(weekendId: string, hosted: boolean): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: w } = await g.db.from("hs_weekends").select("id, event, starts_on, ends_on").eq("id", weekendId).maybeSingle();
  if (!w) return { error: "That weekend isn't on the schedule any more." };
  const weekend = w as { id: string; event: string; starts_on: string; ends_on: string };
  const { data: have, error: readErr } = await g.db.from("hs_hosted").select("weekend_id").eq("weekend_id", weekendId).maybeSingle();
  if (readErr) return { error: MIGRATION };
  if (have) {
    const { error } = await g.db.from("hs_hosted").update({ hosted, updated_by: g.userId }).eq("weekend_id", weekendId);
    if (error) return { error: error.message };
  } else if (hosted) {
    const { error } = await g.db.from("hs_hosted").insert({
      weekend_id: weekendId,
      hosted: true,
      short_name: initials(weekend.event) || null,
      days: daysForWeekend(weekend.starts_on, weekend.ends_on, []),
      created_by: g.userId,
      updated_by: g.userId,
    });
    if (error) return { error: error.message };
    await g.db.from("hs_hosted_steps").insert(DEFAULT_STEPS.map((s, i) => ({ weekend_id: weekendId, section: s.section, label: s.label, step_key: s.key ?? null, sort_order: i })));
    await g.db.from("hs_hosted_money").insert(starterMoney(weekendId, weekend.starts_on, weekend.ends_on));
  }
  revalidatePath("/portal/schedule");
  refresh(weekendId);
  return {};
}

// The lines the director's spreadsheet starts from, at $0 to fill in.
function starterMoney(weekendId: string, startsOn: string, endsOn: string) {
  const rows: { kind: MoneyKind; category: MoneyCategory; label: string }[] = [
    { kind: "revenue", category: "sponsor", label: "Court sponsor (court banner)" },
    { kind: "revenue", category: "sponsor", label: "Tournament sponsor (program ad)" },
    { kind: "revenue", category: "admission", label: "Student (day)" },
    { kind: "revenue", category: "admission", label: "Individual day pass" },
    { kind: "revenue", category: "admission", label: "Individual weekend pass" },
    { kind: "revenue", category: "admission", label: "Family day pass" },
    { kind: "revenue", category: "admission", label: "Family weekend pass" },
    ...daysForWeekend(startsOn, endsOn, []).map((d) => ({
      kind: "expense" as const,
      category: "court" as const,
      label: `Courts ${new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" })}`,
    })),
    { kind: "expense", category: "referee", label: "Referee assigning fee" },
  ];
  return rows.map((r, i) => ({ weekend_id: weekendId, ...r, qty: null, unit_cents: 0, sort_order: i }));
}

// ─── The tournament's details ───────────────────────────────────────────────

export interface PlanInput {
  short_name: string;
  game_minutes: number;
  courts: number;
  days: { date: string; start: string; end: string }[];
  team_fee: string; // "240", "" = none
  facility: string;
  concessions: string;
  rules: string;
  admission: string;
}

export async function savePlan(weekendId: string, input: PlanInput): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const days = cleanDays(input.days);
  if ("error" in days) return days;
  const minutes = Math.round(Number(input.game_minutes));
  if (!(minutes >= 20 && minutes <= 180)) return { error: "A game slot is between 20 and 180 minutes." };
  const courts = Math.round(Number(input.courts));
  if (!(courts >= 1 && courts <= 20)) return { error: "Pick between 1 and 20 courts." };
  let fee: number | null = null;
  if (input.team_fee.trim()) {
    fee = parseAmount(input.team_fee);
    if (fee == null || fee < 0) return { error: "Enter the team fee in dollars, like 240, or leave it blank." };
  }
  const lock = await loadFeeLockState(weekendId);
  if (lock.locked) {
    const { data: cur, error: curErr } = await g.db.from("hs_hosted").select("team_fee_cents").eq("weekend_id", weekendId).maybeSingle();
    if (curErr || !cur) return { error: feeLockSaveError(lock.invoiceCount, lock.lookupFailed) };
    const current = cur as { team_fee_cents: number | null };
    if (planFeeChanged(current, { team_fee_cents: fee })) return { error: feeLockSaveError(lock.invoiceCount, lock.lookupFailed) };
  }
  const { error } = await g.db
    .from("hs_hosted")
    .update({
      short_name: text(input.short_name, 20),
      game_minutes: minutes,
      courts,
      days,
      team_fee_cents: fee,
      facility: longText(input.facility, 1000),
      concessions: longText(input.concessions, 2000),
      rules: longText(input.rules, 4000),
      admission: longText(input.admission, 2000),
      updated_by: g.userId,
    })
    .eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

// ─── The checklist ──────────────────────────────────────────────────────────

const isSection = (s: string): s is StepSection => STEP_SECTIONS.some((x) => x.key === s);

export async function addStep(weekendId: string, section: string, label: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const l = text(label, 200);
  if (!l) return { error: "Say what needs doing." };
  if (!isSection(section)) return { error: "Pick a section." };
  const { error } = await g.db
    .from("hs_hosted_steps")
    .insert({ weekend_id: weekendId, section, label: l, sort_order: await nextOrder(g.db, "hs_hosted_steps", weekendId) });
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

export async function updateStep(
  weekendId: string,
  id: string,
  patch: { label?: string; due_on?: string | null; done?: boolean; note?: string | null }
): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const l = text(patch.label, 200);
    if (!l) return { error: "Say what needs doing." };
    row.label = l;
  }
  if (patch.due_on !== undefined) {
    if (patch.due_on && !ISO_DAY.test(patch.due_on)) return { error: "Pick a date." };
    row.due_on = patch.due_on || null;
  }
  if (patch.done !== undefined) {
    const { data: existing } = await g.db.from("hs_hosted_steps").select("step_key, label").eq("id", id).eq("weekend_id", weekendId).maybeSingle();
    const auto = hostedStepBillingKey((existing as { step_key: string | null; label: string } | null) ?? {});
    if (auto === "invoices_sent" || auto === "team_fees_collected") {
      return { notice: "This step checks itself from invoices." };
    }
    if (auto === "bill_programs" && !patch.done) {
      const lock = await loadFeeLockState(weekendId);
      const blocked = uncheckBillProgramsError(lock.invoiceCount);
      if (blocked) return { error: blocked };
    }
    row.done_on = patch.done ? new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : null;
    row.done_by = patch.done ? g.userId : null;
  }
  if (patch.note !== undefined) row.note = longText(patch.note, 1000);
  const { error } = await g.db.from("hs_hosted_steps").update(row).eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

export async function deleteStep(weekendId: string, id: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: existing, error: readErr } = await g.db.from("hs_hosted_steps").select("step_key, label").eq("id", id).eq("weekend_id", weekendId).maybeSingle();
  if (readErr) return { error: readErr.message };
  if (isBillingStep((existing as { step_key: string | null; label: string } | null) ?? {})) {
    return { error: "That step stays on the checklist. It tracks billing." };
  }
  const { error } = await g.db.from("hs_hosted_steps").delete().eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

// ─── Divisions and teams ────────────────────────────────────────────────────

export async function saveDivision(
  weekendId: string,
  input: { id?: string; name: string; code: string; format: DivisionFormat }
): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = text(input.name, 60);
  if (!name) return { error: "Name the division, like HS Boys A." };
  const format: DivisionFormat = input.format === "bracket" ? "bracket" : "pool";
  const row = { name, code: text(input.code, 12) ?? initials(name).slice(0, 12), format };
  const { error } = input.id
    ? await g.db.from("hs_hosted_divisions").update(row).eq("id", input.id).eq("weekend_id", weekendId)
    : await g.db.from("hs_hosted_divisions").insert({ ...row, weekend_id: weekendId, sort_order: await nextOrder(g.db, "hs_hosted_divisions", weekendId) });
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

// Its games go with it; its teams stay, without a division.
export async function deleteDivision(weekendId: string, id: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("hs_hosted_divisions").delete().eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

export interface TeamInput {
  id?: string;
  division_id: string | null;
  name: string;
  code: string;
  seed: string;
  fee: string; // "" = the tournament's team fee (nothing for ours)
  ours: boolean;
  note: string;
}

export async function saveTeam(weekendId: string, input: TeamInput): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = text(input.name, 120);
  if (!name) return { error: "Type the team's name." };
  let seed: number | null = null;
  if (input.seed.trim()) {
    seed = Math.round(Number(input.seed));
    if (!(seed >= 1 && seed <= 64)) return { error: "A seed is a number from 1 to 64." };
  }
  let fee: number | null = null;
  if (input.fee.trim()) {
    fee = parseAmount(input.fee);
    if (fee == null || fee < 0) return { error: "Enter the fee in dollars, like 240, 0 for none, or leave it blank for the team fee." };
  }
  const lock = await loadFeeLockState(weekendId);
  if (lock.locked) {
    if (!input.id) {
      if (fee != null || input.ours) return { error: feeLockSaveError(lock.invoiceCount, lock.lookupFailed) };
    } else {
      const { data: cur, error: curErr } = await g.db.from("hs_hosted_teams").select("fee_cents, ours").eq("id", input.id).eq("weekend_id", weekendId).maybeSingle();
      if (curErr) return { error: curErr.message };
      const current = cur as { fee_cents: number | null; ours: boolean } | null;
      if (!current) return { error: "That team isn't there any more." };
      if (current.fee_cents !== fee || !!current.ours !== !!input.ours) return { error: feeLockSaveError(lock.invoiceCount, lock.lookupFailed) };
    }
  }
  const row = {
    division_id: input.division_id || null,
    name,
    code: text(input.code, 12),
    seed,
    fee_cents: fee,
    ours: !!input.ours,
    note: text(input.note, 300),
  };
  const { error } = input.id
    ? await g.db.from("hs_hosted_teams").update(row).eq("id", input.id).eq("weekend_id", weekendId)
    : await g.db.from("hs_hosted_teams").insert({ ...row, weekend_id: weekendId, sort_order: await nextOrder(g.db, "hs_hosted_teams", weekendId) });
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

export async function deleteTeam(weekendId: string, id: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const blocked = await teamHasLiveInvoice(weekendId, id);
  if (blocked) return blocked;
  const { error } = await g.db.from("hs_hosted_teams").delete().eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

async function teamHasLiveInvoice(weekendId: string, teamId: string): Promise<HostedResult | null> {
  try {
    const { createAdminClient } = await import("../supabase/admin");
    const db = createAdminClient();
    const { data: team, error: teamErr } = await db
      .from("hs_hosted_teams")
      .select("id, name, opponent_id")
      .eq("id", teamId)
      .eq("weekend_id", weekendId)
      .maybeSingle();
    if (teamErr) return { error: teamErr.message };
    const t = team as { id: string; name: string; opponent_id: string | null } | null;
    if (!t) return { error: "That team isn't there any more." };
    let opponent: { contact_id: string | null; name: string } | null = null;
    if (t.opponent_id) {
      const { data: opp, error: oppErr } = await db.from("hs_opponents").select("contact_id, name").eq("id", t.opponent_id).maybeSingle();
      if (oppErr) return { error: oppErr.message };
      opponent = (opp as { contact_id: string | null; name: string } | null) ?? null;
    }
    const keys = hostedTeamInvoiceKeys(opponent);
    if (!keys.length) return null;
    const inv = await db.from("inv_invoices").select("id").eq("host_event_id", weekendId).in("host_customer_id", keys).is("voided_at", null).limit(1);
    if (inv.error) return { error: inv.error.message };
    if ((inv.data ?? []).length) return { error: "Void its invoice first." };
    return null;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Void its invoice first." };
  }
}

// Adds a team for each program coming (Yes on the HS Schedule) and each of
// our teams playing that weekend, unless it's already entered.
export async function addTeamsFromSchedule(weekendId: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const res = await loadHostedPage(g.db, weekendId, { canViewFinances: false, canManageFinances: false });
  if (res.kind !== "ok") return { error: "Open the tournament's page again and retry." };
  const { teams, programs, weekend } = res.data;
  const [{ data: opps }, { data: games }, { data: levels }] = await Promise.all([
    g.db.from("hs_opponents").select("id, level_id, status").eq("weekend_id", weekendId),
    g.db.from("hs_weekend_games").select("level_id, games, unsure").eq("weekend_id", weekendId),
    g.db.from("hs_levels").select("id, label, name, sort_order").eq("season_id", weekend.season_id).order("sort_order"),
  ]);
  const opponents = (opps as { id: string; level_id: string | null; status: string }[] | null) ?? [];
  const lv = (levels as { id: string; label: string; name: string | null }[] | null) ?? [];
  const entered = new Set(teams.map((t) => t.opponent_id).filter(Boolean));
  const names = new Set(teams.map((t) => t.name.trim().toLowerCase()));
  let order = await nextOrder(g.db, "hs_hosted_teams", weekendId);
  const rows: Record<string, unknown>[] = [];
  for (const p of programs.filter((x) => x.status === "confirmed")) {
    if (p.opponent_ids.some((id) => entered.has(id)) || names.has(p.name.trim().toLowerCase())) continue;
    const first = opponents.find((o) => p.opponent_ids.includes(o.id) && o.status === "confirmed");
    rows.push({ weekend_id: weekendId, opponent_id: first?.id ?? p.opponent_ids[0], name: p.name, code: initials(p.name).slice(0, 12) || null, sort_order: order++ });
  }
  const ourName = "Omaha Lightning";
  for (const gm of (games as { level_id: string; games: number | null; unsure: boolean }[] | null) ?? []) {
    if (!gm.games && !gm.unsure) continue;
    const l = lv.find((x) => x.id === gm.level_id);
    if (!l) continue;
    const name = `${ourName} ${l.label}`;
    if (names.has(name.toLowerCase())) continue;
    rows.push({ weekend_id: weekendId, ours: true, name, code: `OL ${l.label}`.slice(0, 12), fee_cents: 0, sort_order: order++ });
  }
  if (rows.length === 0) return { notice: "Every team coming is already entered." };
  const { error } = await g.db.from("hs_hosted_teams").insert(rows);
  if (error) return { error: error.message };
  refresh(weekendId);
  return { notice: `Added ${rows.length} ${rows.length === 1 ? "team" : "teams"}. Put each in its division.` };
}

// ─── Games ──────────────────────────────────────────────────────────────────

async function loadGames(db: Db, weekendId: string): Promise<HostedGame[]> {
  const { data } = await db.from("hs_hosted_games").select(GAME_COLUMNS).eq("weekend_id", weekendId);
  return (data as HostedGame[] | null) ?? [];
}

// Numbers every game 1, 2, 3… in division order, then round, then the order
// they were made, so the schedule and brackets read "Game 9".
async function renumber(db: Db, weekendId: string) {
  const [games, { data: divs }] = await Promise.all([
    loadGames(db, weekendId),
    db.from("hs_hosted_divisions").select("id, sort_order").eq("weekend_id", weekendId),
  ]);
  const order = new Map(((divs as { id: string; sort_order: number }[] | null) ?? []).map((d) => [d.id, d.sort_order]));
  const sorted = [...games].sort(
    (a, b) =>
      (order.get(a.division_id ?? "") ?? 999) - (order.get(b.division_id ?? "") ?? 999) || a.round - b.round || a.game_no - b.game_no
  );
  await Promise.all(sorted.map((g, i) => (g.game_no === i + 1 ? null : db.from("hs_hosted_games").update({ game_no: i + 1 }).eq("id", g.id))));
}

// Makes a division's games from its teams: everyone plays everyone for a
// pool, or a placement bracket by seed. Replaces the games it had.
export async function buildDivisionGames(weekendId: string, divisionId: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const [{ data: d }, { data: t }] = await Promise.all([
    g.db.from("hs_hosted_divisions").select("id, name, code, format").eq("id", divisionId).eq("weekend_id", weekendId).maybeSingle(),
    g.db.from("hs_hosted_teams").select(TEAM_COLUMNS).eq("weekend_id", weekendId).eq("division_id", divisionId),
  ]);
  const division = d as Pick<HostedDivision, "id" | "name" | "code" | "format"> | null;
  if (!division) return { error: "That division isn't there any more." };
  const teams = seeded((t as HostedTeam[] | null) ?? []);
  if (teams.length < 2) return { error: `Put at least two teams in ${division.name} first.` };
  if (teams.length > 16) return { error: "A division can have up to 16 teams." };
  const planned = division.format === "bracket" ? placementBracket(teams.length) : roundRobin(teams.length);
  const ids = planned.map(() => crypto.randomUUID());
  const side = (s: Side): { team: string | null; from: string | null } =>
    "seed" in s ? { team: teams[s.seed].id, from: null } : "from" in s ? { team: null, from: `${s.from}:${ids[s.game]}` } : { team: null, from: null };
  const existing = await loadGames(g.db, weekendId);
  const start = Math.max(0, ...existing.map((x) => x.game_no));
  const rows = planned.map((p, i) => {
    const h = side(p.home);
    const a = side(p.away);
    return {
      id: ids[i],
      weekend_id: weekendId,
      division_id: divisionId,
      game_no: start + i + 1,
      round: p.round,
      label: p.places ? placesLabel(p.places) : null,
      home_team_id: h.team,
      away_team_id: a.team,
      home_from: h.from,
      away_from: a.from,
    };
  });
  const { error: delErr } = await g.db.from("hs_hosted_games").delete().eq("weekend_id", weekendId).eq("division_id", divisionId);
  if (delErr) return { error: delErr.message };
  const { error } = await g.db.from("hs_hosted_games").insert(rows);
  if (error) return { error: error.message };
  await renumber(g.db, weekendId);
  refresh(weekendId);
  return { notice: `${division.name}: ${rows.length} ${rows.length === 1 ? "game" : "games"}. Press Fill the courts to give them times.` };
}

export async function clearDivisionGames(weekendId: string, divisionId: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("hs_hosted_games").delete().eq("weekend_id", weekendId).eq("division_id", divisionId);
  if (error) return { error: error.message };
  await renumber(g.db, weekendId);
  refresh(weekendId);
  return {};
}

// One more game by hand: a crossover, a game against an extra team.
export async function addGame(weekendId: string, input: { division_id: string | null; home_team_id: string | null; away_team_id: string | null }): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (input.home_team_id && input.home_team_id === input.away_team_id) return { error: "Pick two different teams." };
  const existing = await loadGames(g.db, weekendId);
  const same = existing.filter((x) => x.division_id === (input.division_id || null));
  const { error } = await g.db.from("hs_hosted_games").insert({
    weekend_id: weekendId,
    division_id: input.division_id || null,
    game_no: Math.max(0, ...existing.map((x) => x.game_no)) + 1,
    round: Math.max(1, ...same.map((x) => x.round)),
    home_team_id: input.home_team_id || null,
    away_team_id: input.away_team_id || null,
  });
  if (error) return { error: error.message };
  await renumber(g.db, weekendId);
  refresh(weekendId);
  return {};
}

export interface GamePatch {
  plays_on?: string | null;
  starts_at?: string | null;
  court?: number | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  label?: string | null;
}

// Changes a game: its time and court, its teams, its score. A score moves
// the winner and loser on to the bracket games they feed.
export async function updateGame(weekendId: string, id: string, patch: GamePatch): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const row: Record<string, unknown> = {};
  if (patch.plays_on !== undefined) {
    if (patch.plays_on && !ISO_DAY.test(patch.plays_on)) return { error: "Pick a day." };
    row.plays_on = patch.plays_on || null;
  }
  if (patch.starts_at !== undefined) {
    if (patch.starts_at && toMinutes(patch.starts_at) == null) return { error: "Pick a time." };
    row.starts_at = patch.starts_at || null;
  }
  if (patch.court !== undefined) {
    if (patch.court != null && !(patch.court >= 1 && patch.court <= 20)) return { error: "Pick a court." };
    row.court = patch.court;
  }
  if (patch.home_team_id !== undefined) row.home_team_id = patch.home_team_id || null;
  if (patch.away_team_id !== undefined) row.away_team_id = patch.away_team_id || null;
  if (patch.label !== undefined) row.label = text(patch.label, 80);
  if (patch.home_score !== undefined || patch.away_score !== undefined) {
    const h = patch.home_score;
    const a = patch.away_score;
    if ((h == null) !== (a == null)) return { error: "Enter both scores, or neither." };
    if (h != null && a != null && !(h >= 0 && h <= 300 && a >= 0 && a <= 300)) return { error: "Check the score." };
    row.home_score = h ?? null;
    row.away_score = a ?? null;
  }
  if (row.home_team_id && row.home_team_id === row.away_team_id) return { error: "Pick two different teams." };
  const { error } = await g.db.from("hs_hosted_games").update(row).eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  // Move winners and losers on, as far as the scores go.
  for (let pass = 0; pass < 6; pass++) {
    const moves = advance(await loadGames(g.db, weekendId));
    if (moves.length === 0) break;
    await Promise.all(moves.map((m) => g.db.from("hs_hosted_games").update({ home_team_id: m.home_team_id, away_team_id: m.away_team_id }).eq("id", m.id)));
  }
  refresh(weekendId);
  return {};
}

export async function deleteGame(weekendId: string, id: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("hs_hosted_games").delete().eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  await renumber(g.db, weekendId);
  refresh(weekendId);
  return {};
}

// Gives every game without a time the earliest open court, keeping teams
// from playing two at once and bracket games after the ones that feed them.
// "again": take every game without a score off the courts first.
export async function fillTheCourts(weekendId: string, again: boolean): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: p } = await g.db.from("hs_hosted").select(PLAN_COLUMNS).eq("weekend_id", weekendId).maybeSingle();
  const plan = p as HostedPlan | null;
  if (!plan) return { error: MIGRATION };
  let games = await loadGames(g.db, weekendId);
  if (games.length === 0) return { error: "Make the games first: open a division and press Make the games." };
  if (again) {
    const { error } = await g.db
      .from("hs_hosted_games")
      .update({ plays_on: null, starts_at: null, court: null })
      .eq("weekend_id", weekendId)
      .is("home_score", null);
    if (error) return { error: error.message };
    games = games.map((x) => (x.home_score == null ? { ...x, plays_on: null, starts_at: null, court: null } : x));
  }
  const slots = slotsFor(Array.isArray(plan.days) ? plan.days : [], plan.game_minutes, plan.courts);
  if (slots.length === 0) return { error: "Set the days and times in Details first." };
  const { placed, unplaced } = fillCourts(games, slots, plan.game_minutes);
  await Promise.all(placed.map((x) => g.db.from("hs_hosted_games").update({ plays_on: x.plays_on, starts_at: x.starts_at, court: x.court }).eq("id", x.id)));
  refresh(weekendId);
  if (unplaced.length) {
    return {
      notice: `Placed ${placed.length} ${placed.length === 1 ? "game" : "games"}. ${unplaced.length} didn't fit: add a court, open earlier or close later in Details, then press Fill the courts again.`,
    };
  }
  return { notice: placed.length ? `Placed ${placed.length} ${placed.length === 1 ? "game" : "games"}.` : "Every game already has a court." };
}

// ─── Money ──────────────────────────────────────────────────────────────────

export interface MoneyInput {
  id?: string;
  kind: MoneyKind;
  category: MoneyCategory;
  label: string;
  qty: string; // "" = none (a referee line then follows the games)
  unit: string; // dollars
  division_id: string | null;
  note: string;
}

const CATEGORIES: MoneyCategory[] = ["sponsor", "admission", "court", "referee", "other"];

export async function saveMoney(weekendId: string, input: MoneyInput): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const label = text(input.label, 120);
  if (!label) return { error: "Say what it is, like Friday court hours." };
  if (input.kind !== "revenue" && input.kind !== "expense") return { error: "Pick revenue or expense." };
  if (!CATEGORIES.includes(input.category)) return { error: "Pick a kind." };
  const qty = parseCount(input.qty);
  if (qty === undefined) return { error: "The count is a number, like 45." };
  const unit = input.unit.trim() ? parseAmount(input.unit) : 0;
  if (unit == null || unit < 0) return { error: "Enter the amount in dollars, like 50." };
  const row = {
    kind: input.kind,
    category: input.category,
    label,
    qty,
    unit_cents: unit,
    division_id: input.category === "referee" ? input.division_id || null : null,
    note: text(input.note, 300),
  };
  const { error } = input.id
    ? await g.db.from("hs_hosted_money").update(row).eq("id", input.id).eq("weekend_id", weekendId)
    : await g.db.from("hs_hosted_money").insert({ ...row, weekend_id: weekendId, sort_order: await nextOrder(g.db, "hs_hosted_money", weekendId) });
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

export async function deleteMoney(weekendId: string, id: string): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("hs_hosted_money").delete().eq("id", id).eq("weekend_id", weekendId);
  if (error) return { error: error.message };
  refresh(weekendId);
  return {};
}

// ─── Email to the programs coming ───────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One email per program picked (to everyone we have for it), plus one to
// each extra address typed in, so programs don't see each other's emails.
// The emails come from External Contacts as the sender sees them.
export async function sendProgramEmail(
  weekendId: string,
  input: { subject: string; body: string; programs: string[]; extra: string }
): Promise<HostedResult> {
  const g = await gate();
  if ("error" in g) return g;
  if (await getPreview()) return { error: "Emails are off during Preview as: they'd come from the member you're previewing." };
  const subject = text(input.subject, 200);
  const body = (input.body ?? "").trim();
  if (!subject) return { error: "Add a subject." };
  if (!body || body.length > 20000) return { error: "Write the message (up to 20,000 characters)." };
  const res = await loadHostedPage(g.db, weekendId, { canViewFinances: false, canManageFinances: false });
  if (res.kind !== "ok") return { error: "Open the tournament's page again and retry." };
  const picked = res.data.programs.filter((p) => input.programs.includes(p.key) && p.emails.length > 0);
  const extra = [...new Set((input.extra ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const bad = extra.filter((e) => !EMAIL.test(e));
  if (bad.length) return { error: `Check ${bad.length === 1 ? "this email" : "these emails"}: ${bad.join(", ")}` };
  const groups = [...picked.map((p) => p.emails), ...extra.map((e) => [e])].slice(0, 300);
  if (groups.length === 0) return { error: "Pick at least one program with an email, or type an email." };
  const html = messageHtml(body);
  const sent = await sendFamilyEmails(groups.map((to) => ({ to, subject, text: body, html })));
  if (sent.sent > 0) {
    await g.db.from("hs_hosted_messages").insert({
      weekend_id: weekendId,
      subject,
      body,
      sent_to: groups.slice(0, sent.sent).flat(),
      sent_count: sent.sent,
      sent_by: g.userId,
    });
    refresh(weekendId);
  }
  if (sent.error) return { error: sent.error };
  return { notice: `Sent to ${sent.sent} ${sent.sent === 1 ? "program" : "programs"}.` };
}
