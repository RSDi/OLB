// Server-only. The Uniforms page (0130): the season's items, every roster
// player with the sizes picked for them, and who still needs one. Service
// role; the page checks the uniforms permission (or Registrations) first.

import { createAdminClient } from "../supabase/admin";
import { itemsFor, type UniformItem } from "./form-extras";
import { loadUniforms, seasonBoardId, type UniformSettings } from "./server";
import type { SizeRow } from "./uniforms";

export interface UniformPlayer {
  id: string;
  name: string;
  team: string | null;
  // Item ids this player needs sized, when their registration says (null:
  // no registration on file, so nothing is assumed).
  needs: string[] | null;
  sizes: Record<string, { size: string; confirmed: boolean; charged: boolean }>;
}

export interface UniformPage {
  settings: UniformSettings;
  items: UniformItem[];
  players: UniformPlayer[];
  rows: SizeRow[];
  // Sizes picked on registrations not approved yet.
  pending: number;
}

export async function loadUniformPage(): Promise<UniformPage | null> {
  const db = createAdminClient();
  const boardId = await seasonBoardId(db);
  if (!boardId) return null;
  const { settings, items: all } = await loadUniforms(db, boardId);
  const items = all.filter((i) => i.active);
  const [{ data: players }, { data: regs }, { data: sizes }] = await Promise.all([
    db.from("olb_players").select("id, full_name, team:olb_teams(name, sort_order)").eq("board_id", boardId).order("full_name"),
    db.from("olb_registrations").select("player_id, status, extra").eq("board_id", boardId).eq("status", "approved").not("player_id", "is", null),
    db.from("olb_uniform_sizes").select("id, player_id, registration_id, item_id, size, confirmed_at, charge_id").eq("board_id", boardId),
  ]);
  type P = { id: string; full_name: string; team: { name: string; sort_order: number } | null };
  type R = { player_id: string; extra: { needs_uniform?: boolean | null; needs_grays?: boolean | null; fee_tier?: string } | null };
  type S = { id: string; player_id: string | null; registration_id: string | null; item_id: string; size: string; confirmed_at: string | null; charge_id: string | null };
  const regBy = new Map(((regs as R[] | null) ?? []).map((r) => [r.player_id, r]));
  const sizeRows = (sizes as S[] | null) ?? [];
  const list: UniformPlayer[] = ((players as unknown as P[] | null) ?? []).map((p) => {
    const reg = regBy.get(p.id);
    const needs = reg
      ? itemsFor({ needs_uniform: reg.extra?.needs_uniform ?? null, needs_grays: reg.extra?.needs_grays ?? null, fee_tier: reg.extra?.fee_tier ?? "" }, items)
          .filter((i) => i.who !== "optional")
          .map((i) => i.id)
      : null;
    const mine: UniformPlayer["sizes"] = {};
    for (const s of sizeRows) if (s.player_id === p.id) mine[s.item_id] = { size: s.size, confirmed: !!s.confirmed_at, charged: !!s.charge_id };
    return { id: p.id, name: p.full_name, team: p.team?.name ?? null, needs, sizes: mine };
  });
  list.sort((a, b) => (a.team ?? "~").localeCompare(b.team ?? "~") || a.name.localeCompare(b.name));
  const byPlayer = new Map(list.map((p) => [p.id, p]));
  const rows: SizeRow[] = sizeRows
    .filter((s) => s.player_id && byPlayer.has(s.player_id) && items.some((i) => i.id === s.item_id))
    .map((s) => ({
      id: s.id,
      item_id: s.item_id,
      size: s.size,
      player: byPlayer.get(s.player_id!)!.name,
      team: byPlayer.get(s.player_id!)!.team,
      confirmed: !!s.confirmed_at,
      charged: !!s.charge_id,
    }));
  return {
    settings,
    items: items.map(({ id, name, who, price_cents, sizes }) => ({ id, name, who, price_cents, sizes })),
    players: list,
    rows,
    pending: sizeRows.filter((s) => !s.player_id).length,
  };
}
