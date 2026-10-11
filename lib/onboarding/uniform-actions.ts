"use server";

// Uniforms (0130): Settings → Uniforms (the items, prices, sizes and dates
// Sarah sets) and the Uniforms page (try-on sizes, the order, the charges).
// The uniforms permission or Registrations; writes run with the service
// role after the check.

import { revalidatePath } from "next/cache";
import { requireUniforms } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { chargeUniforms } from "./hooks";
import { loadUniforms, seasonBoardId, type UniformSettings } from "./server";
import { parseSizes } from "./uniforms";
import type { UniformItem, UniformWho } from "./form-extras";

type Result = { error?: string; notice?: string };

function refresh() {
  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory/uniforms");
  revalidatePath("/portal/payments");
}

async function gateAndBoard(): Promise<{ db: ReturnType<typeof createAdminClient>; boardId: string; userId: string } | { error: string }> {
  const gate = await requireUniforms();
  if ("error" in gate) return { error: gate.error };
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return { error: "This season's board isn't set up yet." };
  return { db, boardId, userId: gate.userId };
}

export async function loadUniformSetup(): Promise<{ settings: UniformSettings; items: (UniformItem & { sort_order: number; active: boolean })[] } | { error: string }> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  return loadUniforms(g.db, g.boardId);
}

export async function saveUniformSettings(input: { try_on: string; order_deadline: string; charge_when: string }): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const tryOn = input.try_on?.trim().slice(0, 300) || null;
  const deadline = input.order_deadline?.trim() || null;
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { error: "The order deadline isn't a date." };
  if (input.charge_when !== "order" && input.charge_when !== "registration") return { error: "Pick when families are charged." };
  const { error } = await g.db.from("olb_uniform_settings").upsert({
    board_id: g.boardId,
    try_on: tryOn,
    order_deadline: deadline,
    charge_when: input.charge_when,
    updated_by: g.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export interface ItemInput {
  id?: string;
  name: string;
  who: string;
  price: string; // dollars, blank for not set yet
  sizes: string; // "YS, YM, YL"
  sort_order: number;
}

export async function saveUniformItem(input: ItemInput): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const name = input.name?.trim();
  if (!name || name.length > 60) return { error: "Give the item a name (up to 60 characters)." };
  if (!["all", "hs", "optional"].includes(input.who)) return { error: "Pick who gets it." };
  const priceText = input.price?.trim().replace(/^\$/, "") ?? "";
  let price_cents: number | null = null;
  if (priceText) {
    const n = Number(priceText.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 10000) return { error: "That price doesn't look right." };
    price_cents = Math.round(n * 100);
  }
  const sizes = parseSizes(input.sizes ?? "");
  if (sizes.length === 0) return { error: "Add at least one size, like YS, YM, YL." };
  const row = { board_id: g.boardId, name, who: input.who as UniformWho, price_cents, sizes, sort_order: Number.isInteger(input.sort_order) ? input.sort_order : 0 };
  const { error } = input.id ? await g.db.from("olb_uniform_items").update(row).eq("id", input.id).eq("board_id", g.boardId) : await g.db.from("olb_uniform_items").insert(row);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// Off the form and the order. Sizes already picked for it are kept, in case
// it comes back.
export async function removeUniformItem(id: string): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const { error } = await g.db.from("olb_uniform_items").update({ active: false }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function restoreUniformItem(id: string): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const { error } = await g.db.from("olb_uniform_items").update({ active: true }).eq("id", id).eq("board_id", g.boardId);
  if (error) return { error: error.message };
  refresh();
  return {};
}

// A player's size for an item, set or changed at try-on (confirm) or
// typed in for a family who never picked one. Empty removes it.
export async function setUniformSize(input: { playerId: string; itemId: string; size: string; confirm: boolean }): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const { data: item } = await g.db.from("olb_uniform_items").select("id, sizes").eq("id", input.itemId).eq("board_id", g.boardId).maybeSingle();
  if (!item) return { error: "That item isn't there any more. Refresh the page." };
  const { data: player } = await g.db.from("olb_players").select("id").eq("id", input.playerId).eq("board_id", g.boardId).maybeSingle();
  if (!player) return { error: "That player isn't on this season's roster." };
  const { data: existing } = await g.db.from("olb_uniform_sizes").select("id, charge_id").eq("player_id", input.playerId).eq("item_id", input.itemId).limit(1).maybeSingle();
  const row = existing as { id: string; charge_id: string | null } | null;
  if (!input.size) {
    if (row?.charge_id) return { error: "That size is already on the family's account. Void the charge on Payments first." };
    if (row) await g.db.from("olb_uniform_sizes").delete().eq("id", row.id);
    refresh();
    return {};
  }
  if (!(item as { sizes: string[] }).sizes.includes(input.size)) return { error: "That isn't one of the item's sizes." };
  const patch = { size: input.size, ...(input.confirm ? { confirmed_at: new Date().toISOString(), confirmed_by: g.userId } : {}) };
  const { error } = row
    ? await g.db.from("olb_uniform_sizes").update(patch).eq("id", row.id)
    : await g.db.from("olb_uniform_sizes").insert({ board_id: g.boardId, player_id: input.playerId, item_id: input.itemId, ...patch });
  if (error) return { error: error.message };
  refresh();
  return {};
}

// The order is in: every sized item with a price goes on the families'
// Payments accounts (once each).
export async function markUniformsOrdered(): Promise<Result> {
  const g = await gateAndBoard();
  if ("error" in g) return g;
  const res = await chargeUniforms(g.db, g.boardId, {}, g.userId);
  await g.db.from("olb_uniform_settings").upsert({ board_id: g.boardId, ordered_at: new Date().toISOString(), updated_by: g.userId, updated_at: new Date().toISOString() });
  refresh();
  if (res.error) return { error: `Added ${res.added} charges, then: ${res.error}` };
  const notes = [
    `Added ${res.added} ${res.added === 1 ? "charge" : "charges"} to families' Payments accounts.`,
    res.noPrice.length ? `No price yet for ${res.noPrice.join(", ")}, so those weren't charged.` : "",
    res.notOnRoster ? `${res.notOnRoster} sizes belong to registrations not approved yet; they'll be charged next time.` : "",
  ].filter(Boolean);
  return { notice: notes.join(" ") };
}
