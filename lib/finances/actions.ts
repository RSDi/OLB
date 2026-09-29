"use server";

// Payments (migration 0101). Only finance managers (the Payments grant in
// Settings → Members; super-admins always) record anything. RLS enforces the
// same rule; these guards fail fast with a clear message.
//
// Nothing is edited or deleted: a mistake is voided and entered again, so the
// Treasurer's history stays whole.

import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createClient } from "../supabase/server";
import {
  cleanChargeInput,
  cleanPaymentInput,
  registrationFeeCents,
  registrationTier,
  type ChargeInput,
  type PaymentInput,
} from "./logic";
import { centralToday, currentBoard } from "./data";

export interface FinanceResult {
  success?: boolean;
  error?: string;
}

function refresh() {
  revalidatePath("/portal/payments");
}

// The players' season board, checking they're all on the current one.
async function boardFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  playerIds: string[]
): Promise<{ boardId: string } | { error: string }> {
  const board = await currentBoard(supabase);
  if (!board) return { error: "There's no season set up yet." };
  const { data, error } = await supabase.from("olb_players").select("id, board_id").in("id", playerIds);
  if (error) return { error: error.message };
  const rows = (data as { id: string; board_id: string }[] | null) ?? [];
  if (rows.length !== playerIds.length || rows.some((r) => r.board_id !== board.id)) {
    return { error: "One of those players isn't on this season's roster." };
  }
  return { boardId: board.id };
}

// A registration fee for every registered player who doesn't have one yet,
// from the tier on their registration. Safe to press again: players who
// already have a registration fee (not voided) are skipped.
export async function addRegistrationFees(): Promise<FinanceResult & { added?: number; missing?: string[] }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const board = await currentBoard(supabase);
  if (!board) return { error: "There's no season set up yet." };

  const [{ data: players, error: pErr }, { data: existing, error: cErr }] = await Promise.all([
    supabase
      .from("olb_players")
      .select("id, full_name, registration_fee")
      .eq("board_id", board.id)
      .not("registered_at", "is", null)
      .order("full_name"),
    supabase
      .from("olb_charges")
      .select("player_id")
      .eq("board_id", board.id)
      .eq("category", "registration")
      .is("voided_at", null),
  ]);
  if (pErr || cErr) return { error: (pErr ?? cErr)!.message };

  const charged = new Set(((existing as { player_id: string }[] | null) ?? []).map((c) => c.player_id));
  const today = centralToday();
  const missing: string[] = [];
  const rows = [];
  for (const p of (players as { id: string; full_name: string; registration_fee: string | null }[] | null) ?? []) {
    if (charged.has(p.id)) continue;
    const cents = registrationFeeCents(p.registration_fee);
    if (cents == null || cents <= 0) {
      missing.push(p.full_name);
      continue;
    }
    const tier = registrationTier(p.registration_fee);
    rows.push({
      board_id: board.id,
      player_id: p.id,
      kind: "charge",
      category: "registration",
      description: tier ? `Registration fee (${tier})` : "Registration fee",
      amount_cents: cents,
      entry_date: today,
      created_by: gate.userId,
    });
  }
  if (rows.length > 0) {
    const { error } = await supabase.from("olb_charges").insert(rows);
    if (error) return { error: error.message };
  }
  refresh();
  return { success: true, added: rows.length, missing };
}

// A charge (or a credit) on one or more players: a uniform for one kid, a
// tournament fee for a whole family, a board-voted hardship credit.
export async function addCharges(input: ChargeInput): Promise<FinanceResult> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const c = cleanChargeInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const b = await boardFor(supabase, c.player_ids);
  if ("error" in b) return { error: b.error };
  const { error } = await supabase.from("olb_charges").insert(
    c.player_ids.map((player_id) => ({
      board_id: b.boardId,
      player_id,
      kind: c.kind,
      category: c.category,
      description: c.description,
      amount_cents: c.amount_cents,
      entry_date: c.entry_date,
      note: c.note,
      created_by: gate.userId,
    }))
  );
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Money received: one Venmo or check, split across the players it pays for.
// The rows share a group_id and go in with one insert, so they land together.
export async function recordPayment(input: PaymentInput): Promise<FinanceResult> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const c = cleanPaymentInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const b = await boardFor(
    supabase,
    c.splits.map((s) => s.player_id)
  );
  if ("error" in b) return { error: b.error };
  const group_id = crypto.randomUUID();
  const { error } = await supabase.from("olb_payments").insert(
    c.splits.map((s) => ({
      board_id: b.boardId,
      group_id,
      player_id: s.player_id,
      amount_cents: s.amount_cents,
      paid_on: c.paid_on,
      method: c.method,
      reference: c.reference,
      note: c.note,
      recorded_by: gate.userId,
    }))
  );
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function voidCharge(id: string): Promise<FinanceResult> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_charges")
    .update({ voided_at: new Date().toISOString(), voided_by: gate.userId })
    .eq("id", id)
    .is("voided_at", null);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Voids the whole payment: every player's share of that Venmo or check.
export async function voidPayment(groupId: string): Promise<FinanceResult> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("olb_payments")
    .update({ voided_at: new Date().toISOString(), voided_by: gate.userId })
    .eq("group_id", groupId)
    .is("voided_at", null);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Parents see their own balances on the Payments page only while this is on.
export async function setParentBalancesVisible(visible: boolean): Promise<FinanceResult> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const board = await currentBoard(supabase);
  if (!board) return { error: "There's no season set up yet." };
  const { error } = await supabase.rpc("set_parent_balances_visible", { p_board_id: board.id, p_visible: visible });
  if (error) return { error: error.message };
  refresh();
  // The sidebar's Payments item follows this for parents.
  revalidatePath("/portal", "layout");
  return { success: true };
}
