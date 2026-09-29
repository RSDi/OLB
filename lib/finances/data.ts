// Payments (migration 0101): loading the season's charges and payments for
// the Payments page. Server-only (it uses the server Supabase client), but not
// "use server": these aren't actions.
//
// Everything runs under the viewer's RLS. A finance manager gets every player
// and entry on the board; a parent gets their own players' entries, and only
// once the Treasurer has turned parents' balances on.

import { createClient } from "../supabase/server";
import {
  CHARGE_COLUMNS,
  PAYMENT_COLUMNS,
  type Charge,
  type Payment,
  type PaymentsBoard,
  type PaymentsData,
  type PaymentsPlayer,
} from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

// Today in Omaha, as YYYY-MM-DD. The server runs on UTC, which is already
// tomorrow on a weekday evening.
export function centralToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

// The latest season ("2026-2027" style, so seasons sort as text).
export async function currentBoard(supabase: Db): Promise<PaymentsBoard | null> {
  const { data } = await supabase
    .from("olb_boards")
    .select("id, season, parent_balances_visible")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PaymentsBoard | null) ?? null;
}

const PLAYER_COLUMNS =
  "id, full_name, age_group, registration_fee, payment_method, registered_at, " +
  "team:olb_teams(id, name, age_group, color), " +
  "parents:olb_player_parents(relationship, member:members(id, full_name, email, phone))";

// The season's players and money. `onlyPlayerIds` narrows it to one family
// (a parent's own players; RLS also shows them the Directory's players).
export async function loadPaymentsData(opts: { onlyPlayerIds?: string[] } = {}): Promise<PaymentsData | null> {
  const supabase = await createClient();
  const board = await currentBoard(supabase);
  if (!board) return null;
  const only = opts.onlyPlayerIds;
  if (only && only.length === 0) return { board, players: [], charges: [], payments: [], names: {} };

  let players = supabase.from("olb_players").select(PLAYER_COLUMNS).eq("board_id", board.id);
  let charges = supabase.from("olb_charges").select(CHARGE_COLUMNS).eq("board_id", board.id);
  let payments = supabase.from("olb_payments").select(PAYMENT_COLUMNS).eq("board_id", board.id);
  if (only) {
    players = players.in("id", only);
    charges = charges.in("player_id", only);
    payments = payments.in("player_id", only);
  }
  const [p, c, pay] = await Promise.all([
    players.order("full_name"),
    charges.order("entry_date").order("created_at"),
    payments.order("paid_on").order("created_at"),
  ]);

  const playerRows = ((p.data as unknown as PaymentsPlayer[] | null) ?? []).map((pl) => ({
    ...pl,
    parents: pl.parents.filter((pa) => pa.member),
  }));
  const chargeRows = (c.data as Charge[] | null) ?? [];
  const paymentRows = (pay.data as Payment[] | null) ?? [];

  // Names for "added by": only finance managers see these (parents' entries
  // come without them on the page).
  const userIds = [
    ...new Set(
      [...chargeRows.map((r) => r.created_by), ...paymentRows.map((r) => r.recorded_by)].filter(
        (id): id is string => !!id
      )
    ),
  ];
  const names: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: people } = await supabase.from("members").select("user_id, full_name").in("user_id", userIds);
    for (const m of (people as { user_id: string; full_name: string | null }[] | null) ?? []) {
      if (m.full_name) names[m.user_id] = m.full_name;
    }
  }

  return { board, players: playerRows, charges: chargeRows, payments: paymentRows, names };
}

// The signed-in parent's own players (any board), by their member row.
export async function myPlayerIds(memberId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("olb_player_parents").select("player_id").eq("member_id", memberId);
  return ((data as { player_id: string }[] | null) ?? []).map((r) => r.player_id);
}

// Whether the sidebar shows a parent the Payments item: their balances are
// open and there's something on their account. RLS returns no rows otherwise.
export async function parentHasBalance(): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase.from("olb_charges").select("id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}
