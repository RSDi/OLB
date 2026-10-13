// Server-only. Each family's money and contacts this season, read with the
// service role, for messages from Finances and the weekly reminder (0133).

import type { SupabaseClient } from "@supabase/supabase-js";
import { familyBalances, loadDues } from "./club-data";
import { familyName } from "./logic";
import { moneyFor, type FamilyMoney } from "./reminders";
import type { PlayerWithParents } from "../teams/family-mail";

type Db = SupabaseClient;

export interface FamilyMoneyBook {
  // One per Payments account (players who share a parent).
  accounts: { playerIds: string[]; balanceCents: number; name: string }[];
  dues: Record<string, string>;
  defaultDue: string | null;
  // Players whose family is off the weekly reminder.
  paused: Set<string>;
  moneyOf: (playerIds: string[]) => FamilyMoney;
}

export async function loadFamilyMoney(db: Db, boardId: string): Promise<FamilyMoneyBook> {
  const [fb, { dues, defaultDue }, { data: pauses }] = await Promise.all([
    familyBalances(db, boardId),
    loadDues(db, boardId),
    db.from("olb_reminder_pauses").select("player_id").eq("board_id", boardId),
  ]);
  const seen = new Set<string>();
  const accounts: FamilyMoneyBook["accounts"] = [];
  for (const [id, sibs] of fb.siblings) {
    const ids = [...new Set([id, ...sibs])].sort();
    const key = ids.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    accounts.push({
      playerIds: ids,
      balanceCents: ids.reduce((n, p) => n + (fb.balance.get(p) ?? 0), 0),
      name: familyName(ids.map((p) => ({ full_name: fb.names.get(p) ?? "" }))),
    });
  }
  return {
    accounts,
    dues,
    defaultDue,
    paused: new Set(((pauses as { player_id: string }[] | null) ?? []).map((r) => r.player_id)),
    moneyOf: (playerIds) => moneyFor(playerIds, accounts, dues, defaultDue),
  };
}

const PLAYER_CONTACTS = "id, full_name, email, parents:olb_player_parents(relationship, member:members(full_name, email))";

// This season's players with their parents' emails: the ones asked for, or
// all of them.
export async function boardPlayers(db: Db, boardId: string, ids?: string[]): Promise<PlayerWithParents[]> {
  if (ids && ids.length === 0) return [];
  const out: PlayerWithParents[] = [];
  const chunks = ids ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100)) : [null];
  for (const chunk of chunks) {
    let q = db.from("olb_players").select(PLAYER_CONTACTS).eq("board_id", boardId);
    if (chunk) q = q.in("id", chunk);
    const { data, error } = await q.order("full_name");
    if (error) throw new Error(error.message);
    out.push(...((data as unknown as PlayerWithParents[] | null) ?? []));
  }
  return out;
}
