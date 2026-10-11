"use server";

// Payments → Match Venmo (0130): the Treasurer uploads Venmo's statement,
// sees whose each payment looks like, fixes any guesses, and records them
// all at once. Each is recorded the way Record payment records one (split
// across a family's players by what each owes), with the Venmo ID in its
// reference so the same statement can't record it twice. The Payments
// permission.

import { revalidatePath } from "next/cache";
import { requireFinances } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { splitPayment } from "../finances/logic";
import { alreadyRecorded, matchPlayers, parseVenmoCsv, venmoReference, type VenmoPayment } from "./venmo";
import { seasonBoardId } from "./server";
import { centralDay } from "./dates";

export interface VenmoRow {
  payment: VenmoPayment;
  playerIds: string[];
  already: boolean;
}

export async function readVenmoStatement(csv: string): Promise<{ rows?: VenmoRow[]; players?: { id: string; full_name: string }[]; error?: string }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  if (typeof csv !== "string" || csv.length > 2_000_000) return { error: "That file is too big for a Venmo statement." };
  const parsed = parseVenmoCsv(csv);
  if (parsed.error) return { error: parsed.error };
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  const [{ data: players }, { data: refs }] = await Promise.all([
    db.from("olb_players").select("id, full_name").eq("board_id", boardId).order("full_name"),
    db.from("olb_payments").select("reference").eq("board_id", boardId).ilike("reference", "Venmo %").is("voided_at", null),
  ]);
  const list = (players as { id: string; full_name: string }[] | null) ?? [];
  const references = ((refs as { reference: string | null }[] | null) ?? []).map((r) => r.reference);
  return {
    rows: parsed.payments.map((p) => ({ payment: p, playerIds: matchPlayers(p, list), already: alreadyRecorded(p, references) })),
    players: list,
  };
}

export async function recordVenmoPayments(rows: { payment: VenmoPayment; playerIds: string[] }[]): Promise<{ recorded?: number; error?: string }> {
  const gate = await requireFinances();
  if ("error" in gate) return { error: gate.error };
  if (!Array.isArray(rows) || rows.length === 0) return { error: "Pick at least one payment to record." };
  if (rows.length > 500) return { error: "Record up to 500 at a time." };
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  const { data: refs } = await db.from("olb_payments").select("reference").eq("board_id", boardId).ilike("reference", "Venmo %").is("voided_at", null);
  const references = ((refs as { reference: string | null }[] | null) ?? []).map((r) => r.reference);
  const ids = [...new Set(rows.flatMap((r) => r.playerIds))];
  const [{ data: players }, { data: charges }, { data: paid }] = await Promise.all([
    db.from("olb_players").select("id").eq("board_id", boardId).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    db.from("olb_charges").select("player_id, kind, amount_cents").in("player_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).is("voided_at", null),
    db.from("olb_payments").select("player_id, amount_cents").in("player_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).is("voided_at", null),
  ]);
  const onBoard = new Set(((players as { id: string }[] | null) ?? []).map((p) => p.id));
  const balance = new Map<string, number>();
  for (const c of (charges as { player_id: string; kind: string; amount_cents: number }[] | null) ?? []) balance.set(c.player_id, (balance.get(c.player_id) ?? 0) + (c.kind === "charge" ? c.amount_cents : -c.amount_cents));
  for (const p of (paid as { player_id: string; amount_cents: number }[] | null) ?? []) balance.set(p.player_id, (balance.get(p.player_id) ?? 0) - p.amount_cents);

  let recorded = 0;
  for (const r of rows) {
    const p = r.payment;
    if (!p?.id || !Number.isInteger(p.amount_cents) || p.amount_cents <= 0) continue;
    if (alreadyRecorded(p, references)) continue;
    const who = r.playerIds.filter((id) => onBoard.has(id));
    if (who.length === 0) continue;
    const splits = splitPayment(p.amount_cents, who.map((id) => ({ player_id: id, balance: balance.get(id) ?? 0 })));
    const group_id = crypto.randomUUID();
    const reference = venmoReference(p);
    const { error } = await db.from("olb_payments").insert(
      splits.map((s) => ({
        board_id: boardId,
        group_id,
        player_id: s.player_id,
        amount_cents: s.amount_cents,
        paid_on: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : centralDay(),
        method: "venmo",
        reference,
        note: p.from ? `From ${p.from}`.slice(0, 500) : null,
        recorded_by: gate.userId,
      }))
    );
    if (error) return { recorded, error: `Recorded ${recorded}, then: ${error.message}` };
    for (const s of splits) balance.set(s.player_id, (balance.get(s.player_id) ?? 0) - s.amount_cents);
    references.push(reference);
    recorded++;
  }
  revalidatePath("/portal/payments");
  return { recorded };
}
