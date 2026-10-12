"use server";

// Club finances (0131): Settings → Fees and the Budget, Income, Programs and
// Fundraising tabs on Payments. The Payments permission (the Treasurer;
// super-admins always). Writes run with the service role after the check,
// like the uniform actions. Nothing is deleted: entries are voided.

import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { centralToday } from "./data";
import { cleanTiers, type TierInput } from "./fees";
import { formatAmount, parseAmount } from "./logic";
import {
  cleanIncomeInput,
  cleanLineInput,
  cleanMoneyInput,
  cleanProgramInput,
  cleanShiftInput,
  familySpill,
  NELSONS_LABEL,
  NELSONS_REF,
  splitEvenly,
  type IncomeInput,
  type LineInput,
  type MoneyInput,
  type ProgramInput,
  type ShiftInput,
} from "./club-logic";
import { coachKidIds, compFor, familyBalances, financesReady, latestBoard, loadFinanceSettings } from "./club-data";
import type { FinanceSettings, ShiftDestination, SignupPaidMethod } from "./club-types";

export interface ClubResult {
  error?: string;
  notice?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

function refresh() {
  revalidatePath("/portal/payments");
  revalidatePath("/portal/settings");
}

async function gate(): Promise<{ db: Admin; boardId: string; userId: string } | { error: string }> {
  const g = await requireFinances();
  if ("error" in g) return { error: g.error };
  const db = createAdminClient();
  const board = await latestBoard(db);
  if (!board) return { error: "There's no season set up yet." };
  return { db, boardId: board.id, userId: g.userId };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const now = () => new Date().toISOString();

// ─── Settings → Fees ────────────────────────────────────────────────────────

export interface FeeSettingsInput {
  tiers: TierInput[];
  comp_coach_kids: boolean;
  coach_comp: string; // "" = the whole fee
  fundraising_rate: string;
  default_due_on: string;
}

export async function saveFeeSettings(input: FeeSettingsInput): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const tiers = cleanTiers(input.tiers);
  if ("error" in tiers) return tiers;
  let coach_comp_cents: number | null = null;
  if (input.coach_comp.trim()) {
    coach_comp_cents = parseAmount(input.coach_comp);
    if (coach_comp_cents == null || coach_comp_cents <= 0) return { error: "Enter the coach's kid amount, like 375, or leave it blank for the whole fee." };
  }
  const rate = parseAmount(input.fundraising_rate || "0");
  if (rate == null) return { error: "Enter the fundraising rate per hour, like 10." };
  if (input.default_due_on && !ISO_DAY.test(input.default_due_on)) return { error: "Pick a due date." };
  const { error } = await g.db.from("olb_finance_settings").upsert({
    board_id: g.boardId,
    fee_tiers: tiers,
    comp_coach_kids: !!input.comp_coach_kids,
    coach_comp_cents,
    fundraising_rate_cents: rate,
    default_due_on: input.default_due_on || null,
    updated_by: g.userId,
    updated_at: now(),
  });
  if (error) return { error: error.message };
  refresh();
  revalidatePath("/player-registration");
  return { notice: "Saved." };
}

export async function setFinancesEnabled(enabled: boolean): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db
    .from("olb_finance_settings")
    .upsert({ board_id: g.boardId, enabled, updated_by: g.userId, updated_at: now() }, { onConflict: "board_id" });
  if (error) return { error: error.message };
  refresh();
  revalidatePath("/portal", "layout");
  return {};
}

// Coaches' kids who have a registration fee and no comp yet get one: for
// coaches put on a team after their kid was approved.
export async function compCoachKidsNow(): Promise<ClubResult & { added?: number }> {
  const g = await gate();
  if ("error" in g) return g;
  const settings = await loadFinanceSettings(g.db, g.boardId);
  if (!settings.comp_coach_kids) return { error: "Turn on \"Comp coaches' kids\" first." };
  const kids = await coachKidIds(g.db, g.boardId);
  if (kids.size === 0) return { notice: "No coaches' kids on the roster yet. Put coaches on teams in Settings → Teams." };
  const { data: fees } = await g.db
    .from("olb_charges")
    .select("player_id, amount_cents")
    .eq("board_id", g.boardId)
    .eq("category", "registration")
    .is("voided_at", null)
    .in("player_id", [...kids]);
  let added = 0;
  for (const f of (fees as { player_id: string; amount_cents: number }[] | null) ?? []) {
    if (await compFor(g.db, g.boardId, f.player_id, f.amount_cents, settings.coach_comp_cents, g.userId)) added++;
  }
  refresh();
  return { added, notice: added ? `Took the fee off for ${added} coach's ${added === 1 ? "kid" : "kids"}.` : "Every coach's kid already has theirs." };
}

// ─── Due dates ──────────────────────────────────────────────────────────────

export async function setFamilyDue(playerIds: string[], dueOn: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return { error: "No players to set a date for." };
  if (!dueOn) {
    const { error } = await g.db.from("olb_player_due").delete().in("player_id", ids);
    if (error) return { error: error.message };
  } else {
    if (!ISO_DAY.test(dueOn)) return { error: "Pick a date." };
    const { error } = await g.db
      .from("olb_player_due")
      .upsert(ids.map((player_id) => ({ player_id, board_id: g.boardId, due_on: dueOn, updated_by: g.userId, updated_at: now() })));
    if (error) return { error: error.message };
  }
  refresh();
  return {};
}

// ─── Budget ─────────────────────────────────────────────────────────────────

export async function saveBudgetGroup(input: { id?: string; name: string }): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "Give the group a name." };
  if (input.id) {
    const { error } = await g.db.from("olb_budget_groups").update({ name }).eq("id", input.id).eq("board_id", g.boardId);
    if (error) return { error: error.code === "23505" ? "There's already a group with that name." : error.message };
  } else {
    const { data: last } = await g.db.from("olb_budget_groups").select("sort_order").eq("board_id", g.boardId).order("sort_order", { ascending: false }).limit(1);
    const sort_order = (((last as { sort_order: number }[] | null) ?? [])[0]?.sort_order ?? 0) + 10;
    const { error } = await g.db.from("olb_budget_groups").insert({ board_id: g.boardId, name, sort_order });
    if (error) return { error: error.code === "23505" ? "There's already a group with that name." : error.message };
  }
  refresh();
  return {};
}

export async function saveBudgetLine(input: LineInput): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const c = cleanLineInput(input);
  if ("error" in c) return c;
  const { error } = input.id
    ? await g.db.from("olb_budget_lines").update(c).eq("id", input.id).eq("board_id", g.boardId).is("voided_at", null)
    : await g.db.from("olb_budget_lines").insert({ ...c, board_id: g.boardId, created_by: g.userId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function voidBudgetLine(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: paid } = await g.db.from("olb_expense_payments").select("id").eq("line_id", id).is("voided_at", null).limit(1);
  if ((paid ?? []).length > 0) return { error: "Void its payments first." };
  const { error } = await g.db.from("olb_budget_lines").update({ voided_at: now(), voided_by: g.userId }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function recordExpensePayment(lineId: string, input: MoneyInput): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const c = cleanMoneyInput(input);
  if ("error" in c) return c;
  const { data: line } = await g.db.from("olb_budget_lines").select("id").eq("id", lineId).eq("board_id", g.boardId).is("voided_at", null).maybeSingle();
  if (!line) return { error: "That line isn't there any more. Refresh the page." };
  const { error } = await g.db.from("olb_expense_payments").insert({
    board_id: g.boardId,
    line_id: lineId,
    amount_cents: c.amount_cents,
    paid_on: c.date,
    method: c.method,
    reference: c.reference,
    note: c.note,
    recorded_by: g.userId,
  });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function voidExpensePayment(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("olb_expense_payments").update({ voided_at: now(), voided_by: g.userId }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// A team cost passed on to that team's families: a 'team_cost' charge on
// each player picked, in even shares of the total (or the same amount each).
export async function splitAcrossTeam(input: {
  lineId: string;
  playerIds: string[];
  amount: string;
  each: boolean; // true: the amount is per player; false: split the amount
  description: string;
}): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: line } = await g.db
    .from("olb_budget_lines")
    .select("id, description, team_id")
    .eq("id", input.lineId)
    .eq("board_id", g.boardId)
    .is("voided_at", null)
    .maybeSingle();
  if (!line) return { error: "That line isn't there any more. Refresh the page." };
  const ids = [...new Set(input.playerIds.filter(Boolean))];
  if (ids.length === 0) return { error: "Pick the players to charge." };
  const cents = parseAmount(input.amount);
  if (cents == null || cents <= 0) return { error: "Enter an amount, like 260." };
  const { data: onBoard } = await g.db.from("olb_players").select("id").eq("board_id", g.boardId).in("id", ids);
  if (((onBoard as { id: string }[] | null) ?? []).length !== ids.length) return { error: "One of those players isn't on this season's roster." };
  const shares = input.each ? ids.map(() => cents) : splitEvenly(cents, ids.length);
  const description = (input.description.trim() || (line as { description: string }).description).slice(0, 120);
  const { data: charges, error } = await g.db
    .from("olb_charges")
    .insert(
      ids.map((player_id, i) => ({
        board_id: g.boardId,
        player_id,
        kind: "charge",
        category: "team_cost",
        description,
        amount_cents: shares[i],
        entry_date: centralToday(),
        created_by: g.userId,
      }))
    )
    .select("id");
  if (error) return { error: error.message };
  const links = ((charges as { id: string }[] | null) ?? []).map((c) => ({ line_id: input.lineId, charge_id: c.id }));
  if (links.length) await g.db.from("olb_budget_line_charges").insert(links);
  refresh();
  const total = shares.reduce((n, s) => n + s, 0);
  return { notice: `Charged ${ids.length} ${ids.length === 1 ? "player" : "players"}, $${(total / 100).toFixed(2)} in all. It's on their families' accounts.` };
}

// ─── Tournaments we host ────────────────────────────────────────────────────

export async function saveHostedEvent(input: { id?: string; name: string; starts_on: string; ends_on: string; note: string }): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Give the tournament a name, like MRS." };
  for (const d of [input.starts_on, input.ends_on]) if (d && !ISO_DAY.test(d)) return { error: "Check the dates." };
  const row = { name, starts_on: input.starts_on || null, ends_on: input.ends_on || null, note: input.note.trim().slice(0, 500) || null };
  const { error } = input.id
    ? await g.db.from("olb_hosted_events").update(row).eq("id", input.id).eq("board_id", g.boardId)
    : await g.db.from("olb_hosted_events").insert({ ...row, board_id: g.boardId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

// ─── Income ─────────────────────────────────────────────────────────────────

export async function saveIncome(input: IncomeInput): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const c = cleanIncomeInput(input);
  if ("error" in c) return c;
  const { error } = input.id
    ? await g.db.from("olb_income").update(c).eq("id", input.id).eq("board_id", g.boardId).is("voided_at", null)
    : await g.db.from("olb_income").insert({ ...c, board_id: g.boardId, recorded_by: g.userId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function voidIncome(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("olb_income").update({ voided_at: now(), voided_by: g.userId }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// ─── Programs ───────────────────────────────────────────────────────────────

export async function saveProgram(input: ProgramInput): Promise<ClubResult & { id?: string }> {
  const g = await gate();
  if ("error" in g) return g;
  const c = cleanProgramInput(input);
  if ("error" in c) return c;
  if (input.id) {
    const { error } = await g.db.from("olb_programs").update(c).eq("id", input.id).eq("board_id", g.boardId);
    if (error) return { error: error.message };
    refresh();
    return { id: input.id };
  }
  const { data, error } = await g.db.from("olb_programs").insert({ ...c, board_id: g.boardId, created_by: g.userId }).select("id").single();
  if (error) return { error: error.message };
  refresh();
  return { id: (data as { id: string }).id };
}

export async function setProgramOpen(id: string, open: boolean): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db.from("olb_programs").update({ open }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  revalidatePath("/summer");
  return {};
}

export async function archiveProgram(id: string, archived: boolean): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { error } = await g.db
    .from("olb_programs")
    .update({ archived_at: archived ? now() : null, ...(archived ? { open: false } : {}) })
    .eq("id", id)
    .eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// Paid (or waived) on the sign-up, for a child who isn't on the roster. A
// roster player's fee is paid on Payments like everything else.
export async function markSignupPaid(
  id: string,
  input: { amount: string; method: string; date: string; reference: string }
): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: s } = await g.db.from("olb_program_signups").select("id, charge_id, price_cents").eq("id", id).eq("board_id", g.boardId).maybeSingle();
  if (!s) return { error: "That sign-up isn't there any more. Refresh the page." };
  if ((s as { charge_id: string | null }).charge_id) return { error: "This one's on the family's Payments account. Record the payment there." };
  const method = input.method as SignupPaidMethod;
  if (!["venmo", "check", "cash", "card", "other", "waived"].includes(method)) return { error: "Pick how they paid." };
  let paid_cents = 0;
  if (method !== "waived") {
    const c = parseAmount(input.amount);
    if (c == null || c < 0) return { error: "Enter what they paid, like 60." };
    paid_cents = c;
  }
  if (input.date && !ISO_DAY.test(input.date)) return { error: "Pick the date." };
  const { error } = await g.db
    .from("olb_program_signups")
    .update({
      paid_cents,
      paid_method: method,
      paid_on: input.date || centralToday(),
      paid_ref: input.reference.trim().slice(0, 80) || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// Paid from Nelson's Produce earnings: the fee goes on the family's account
// as a charge, where their Nelson's credit pays it. Roster players only.
export async function coverWithCredit(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data } = await g.db
    .from("olb_program_signups")
    .select("id, player_id, charge_id, price_cents, cancelled_at, program:olb_programs(name)")
    .eq("id", id)
    .eq("board_id", g.boardId)
    .maybeSingle();
  const s = data as { player_id: string | null; charge_id: string | null; price_cents: number; cancelled_at: string | null; program: { name: string } | null } | null;
  if (!s || s.cancelled_at) return { error: "That sign-up isn't there any more. Refresh the page." };
  if (!s.player_id) return { error: "Only a player on the roster has an account to charge." };
  if (s.charge_id) return { error: "This one's already on the family's Payments account." };
  const { data: charge, error: chargeError } = await g.db
    .from("olb_charges")
    .insert({
      board_id: g.boardId,
      player_id: s.player_id,
      kind: "charge",
      category: "program",
      description: `${s.program?.name ?? "Program"} (${NELSONS_LABEL})`.slice(0, 120),
      amount_cents: s.price_cents,
      entry_date: centralToday(),
      created_by: g.userId,
    })
    .select("id")
    .single();
  if (chargeError || !charge) return { error: chargeError?.message ?? "Couldn't add the charge. Try again." };
  const { error } = await g.db
    .from("olb_program_signups")
    .update({ charge_id: (charge as { id: string }).id, paid_cents: 0, paid_method: null, paid_on: null, paid_ref: NELSONS_REF })
    .eq("id", id);
  if (error) {
    await g.db.from("olb_charges").update({ voided_at: now(), voided_by: g.userId }).eq("id", (charge as { id: string }).id);
    return { error: error.message };
  }
  refresh();
  return {};
}

export async function cancelSignup(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: s } = await g.db.from("olb_program_signups").select("id, charge_id").eq("id", id).eq("board_id", g.boardId).maybeSingle();
  if (!s) return { error: "That sign-up isn't there any more. Refresh the page." };
  const chargeId = (s as { charge_id: string | null }).charge_id;
  if (chargeId) await g.db.from("olb_charges").update({ voided_at: now(), voided_by: g.userId }).eq("id", chargeId).is("voided_at", null);
  const { error } = await g.db.from("olb_program_signups").update({ cancelled_at: now() }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { notice: chargeId ? "Cancelled, and the fee is off the family's account." : "Cancelled." };
}

// ─── Fundraising ────────────────────────────────────────────────────────────

async function postShiftCredit(
  db: Admin,
  boardId: string,
  shift: { fundraiser: string; event_label: string | null; worker_name: string; hours: number; amount_cents: number; player_id: string; worked_on: string | null },
  userId: string
): Promise<{ id: string } | { error: string }> {
  const what = [shift.fundraiser, shift.event_label].filter(Boolean).join(" – ");
  const { data, error } = await db
    .from("olb_charges")
    .insert({
      board_id: boardId,
      player_id: shift.player_id,
      kind: "credit",
      category: "fundraising",
      description: what.slice(0, 120),
      amount_cents: shift.amount_cents,
      entry_date: shift.worked_on ?? centralToday(),
      note: `${shift.worker_name}, ${shift.hours} ${shift.hours === 1 ? "hour" : "hours"}`.slice(0, 500),
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

// spill: once the player's fees are paid, the rest goes on to their brothers
// and sisters, a shift row and credit for each.
export async function addShift(input: ShiftInput, spill = false): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: f } = await g.db.from("olb_fundraisers").select("id, name, rate_cents").eq("id", input.fundraiser_id).eq("board_id", g.boardId).maybeSingle();
  if (!f) return { error: "Pick the fundraiser." };
  const fundraiser = f as { id: string; name: string; rate_cents: number };
  const c = cleanShiftInput(input, fundraiser.rate_cents);
  if ("error" in c) return c;
  if (c.player_id) {
    const { data: p } = await g.db.from("olb_players").select("id").eq("id", c.player_id).eq("board_id", g.boardId).maybeSingle();
    if (!p) return { error: "That player isn't on this season's roster." };
  }
  const fb = c.destination === "family" && c.player_id && spill ? await familyBalances(g.db, g.boardId) : null;
  const pieces = fb && c.player_id ? familySpill(c.amount_cents, c.hours, c.player_id, fb) : [{ player_id: c.player_id, amount_cents: c.amount_cents, hours: c.hours }];
  const posted: string[] = [];
  for (const piece of pieces) {
    let charge_id: string | null = null;
    if (c.destination === "family" && piece.player_id) {
      const credit = await postShiftCredit(g.db, g.boardId, { ...c, ...piece, fundraiser: fundraiser.name, player_id: piece.player_id }, g.userId);
      if ("error" in credit) return credit;
      charge_id = credit.id;
      posted.push(credit.id);
    }
    const { error } = await g.db
      .from("olb_fundraiser_shifts")
      .insert({ ...c, ...piece, board_id: g.boardId, charge_id, recorded_by: g.userId });
    if (error) {
      if (posted.length) await g.db.from("olb_charges").update({ voided_at: now(), voided_by: g.userId }).in("id", posted);
      return { error: error.message };
    }
  }
  refresh();
  return pieces.length > 1 && fb
    ? { notice: `Logged ${c.worker_name}'s shift: ${pieces.map((x) => `${formatAmount(x.amount_cents)} toward ${fb.names.get(x.player_id ?? "") ?? "a player"}`).join(", ")}.` }
    : {};
}

export async function voidShift(id: string): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: s } = await g.db.from("olb_fundraiser_shifts").select("id, charge_id").eq("id", id).eq("board_id", g.boardId).maybeSingle();
  if (!s) return { error: "That shift isn't there any more. Refresh the page." };
  const chargeId = (s as { charge_id: string | null }).charge_id;
  if (chargeId) await g.db.from("olb_charges").update({ voided_at: now(), voided_by: g.userId }).eq("id", chargeId).is("voided_at", null);
  const { error } = await g.db.from("olb_fundraiser_shifts").update({ voided_at: now(), voided_by: g.userId }).eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// The worker changed their mind: the money goes to a different player's
// fees, or to a fund. The old credit is voided and a new one posted.
export async function moveShift(id: string, to: { destination: ShiftDestination; player_id: string; fund_id: string }): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const { data: row } = await g.db
    .from("olb_fundraiser_shifts")
    .select("id, charge_id, event_label, worker_name, hours, amount_cents, worked_on, fundraiser:olb_fundraisers(name)")
    .eq("id", id)
    .eq("board_id", g.boardId)
    .is("voided_at", null)
    .maybeSingle();
  if (!row) return { error: "That shift isn't there any more. Refresh the page." };
  const s = row as unknown as {
    charge_id: string | null;
    event_label: string | null;
    worker_name: string;
    hours: number | string;
    amount_cents: number;
    worked_on: string | null;
    fundraiser: { name: string } | null;
  };
  if (to.destination === "family" && !to.player_id) return { error: "Pick the player." };
  if (to.destination === "fund" && !to.fund_id) return { error: "Pick the fund." };
  if (to.destination !== "family" && to.destination !== "fund") return { error: "Pick where the money goes." };
  let charge_id: string | null = null;
  if (to.destination === "family") {
    const { data: p } = await g.db.from("olb_players").select("id").eq("id", to.player_id).eq("board_id", g.boardId).maybeSingle();
    if (!p) return { error: "That player isn't on this season's roster." };
    const credit = await postShiftCredit(
      g.db,
      g.boardId,
      { fundraiser: s.fundraiser?.name ?? "Fundraiser", event_label: s.event_label, worker_name: s.worker_name, hours: Number(s.hours), amount_cents: s.amount_cents, player_id: to.player_id, worked_on: s.worked_on },
      g.userId
    );
    if ("error" in credit) return credit;
    charge_id = credit.id;
  }
  if (s.charge_id) await g.db.from("olb_charges").update({ voided_at: now(), voided_by: g.userId }).eq("id", s.charge_id).is("voided_at", null);
  const { error } = await g.db
    .from("olb_fundraiser_shifts")
    .update({
      destination: to.destination,
      player_id: to.destination === "family" ? to.player_id : null,
      fund_id: to.destination === "fund" ? to.fund_id : null,
      charge_id,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function saveFund(input: { id?: string; name: string; description: string }): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "Give the fund a name." };
  const row = { name, description: input.description.trim().slice(0, 300) || null };
  const { error } = input.id
    ? await g.db.from("olb_program_funds").update(row).eq("id", input.id).eq("board_id", g.boardId)
    : await g.db.from("olb_program_funds").insert({ ...row, board_id: g.boardId });
  if (error) return { error: error.code === "23505" ? "There's already a fund with that name." : error.message };
  refresh();
  return {};
}

export async function saveFundraiser(input: { id?: string; name: string; rate: string }): Promise<ClubResult> {
  const g = await gate();
  if ("error" in g) return g;
  const name = input.name.trim().slice(0, 60);
  if (!name) return { error: "Give the fundraiser a name." };
  const rate_cents = parseAmount(input.rate || "0");
  if (rate_cents == null) return { error: "Enter what an hour earns, like 10." };
  const { error } = input.id
    ? await g.db.from("olb_fundraisers").update({ name, rate_cents }).eq("id", input.id).eq("board_id", g.boardId)
    : await g.db.from("olb_fundraisers").insert({ name, rate_cents, board_id: g.boardId });
  if (error) return { error: error.code === "23505" ? "There's already a fundraiser with that name." : error.message };
  refresh();
  return {};
}

// Settings → Fees: the saved settings, and how many coaches' kids still need
// their comp.
export async function loadFeeSetup(): Promise<{ settings: FinanceSettings; pendingComps: number } | { error: string }> {
  const g = await gate();
  if ("error" in g) return g;
  if (!(await financesReady(g.db))) return { error: "Club finances isn't set up in the database yet. Run migration 0131 in the Supabase SQL editor." };
  const settings = await loadFinanceSettings(g.db, g.boardId);
  let pendingComps = 0;
  if (settings.comp_coach_kids) {
    const kids = await coachKidIds(g.db, g.boardId);
    if (kids.size) {
      const [{ data: fees }, { data: comps }] = await Promise.all([
        g.db.from("olb_charges").select("player_id").eq("board_id", g.boardId).eq("category", "registration").is("voided_at", null).in("player_id", [...kids]),
        g.db.from("olb_charges").select("player_id").eq("board_id", g.boardId).eq("category", "coach_comp").is("voided_at", null).in("player_id", [...kids]),
      ]);
      const comped = new Set(((comps as { player_id: string }[] | null) ?? []).map((c) => c.player_id));
      pendingComps = new Set(((fees as { player_id: string }[] | null) ?? []).map((f) => f.player_id).filter((id) => !comped.has(id))).size;
    }
  }
  return { settings, pendingComps };
}
