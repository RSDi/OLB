// Loaders for hotel stays (0135).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadNames } from "../teams/registration-data";
import { siblingsOnStay, type StaySiblingPlayer } from "./logic";
import {
  HOTEL_STAY_COLUMNS,
  HOTEL_STAY_PLAYER_COLUMNS,
  type HotelStay,
  type HotelStayPlayer,
  type HotelStayView,
} from "./types";

async function hydrateStays(supabase: SupabaseClient, stays: HotelStay[]): Promise<HotelStayView[]> {
  if (stays.length === 0) return [];
  const weekendIds = [...new Set(stays.map((s) => s.weekend_id))];
  const hotelIds = [...new Set(stays.map((s) => s.hotel_contact_id))];
  const [{ data: ws }, { data: hs }] = await Promise.all([
    supabase
      .from("hs_weekends")
      .select("id, season_id, starts_on, ends_on, event, location")
      .in("id", weekendIds),
    supabase.from("contacts").select("id, name, city").in("id", hotelIds),
  ]);
  const weekends =
    (ws as
      | { id: string; season_id: string; starts_on: string; ends_on: string; event: string; location: string | null }[]
      | null) ?? [];
  const hotels = (hs as { id: string; name: string; city: string | null }[] | null) ?? [];
  const seasonIds = [...new Set(weekends.map((w) => w.season_id))];
  const { data: ss } = await supabase.from("hs_seasons").select("id, season").in("id", seasonIds);
  const seasonOf = new Map(((ss as { id: string; season: number }[] | null) ?? []).map((s) => [s.id, s.season]));
  const weekendOf = new Map(weekends.map((w) => [w.id, w]));
  const hotelOf = new Map(hotels.map((h) => [h.id, h]));
  const views: HotelStayView[] = [];
  for (const s of stays) {
    const w = weekendOf.get(s.weekend_id);
    const h = hotelOf.get(s.hotel_contact_id);
    const season = w ? seasonOf.get(w.season_id) : undefined;
    if (!w || season == null) continue;
    views.push({
      ...s,
      hotel_name: h?.name ?? "Hotel",
      hotel_city: h?.city ?? null,
      weekend_event: w.event,
      weekend_starts_on: w.starts_on,
      weekend_ends_on: w.ends_on,
      weekend_location: w.location,
      season,
    });
  }
  return views;
}

export async function loadDirectoryHotelStays(supabase: SupabaseClient): Promise<HotelStayView[]> {
  const { data, error } = await supabase
    .from("hs_hotel_stays")
    .select(HOTEL_STAY_COLUMNS)
    .in("status", ["draft", "open", "closed"])
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) return [];
  const views = await hydrateStays(supabase, (data as HotelStay[] | null) ?? []);
  return views.sort((a, b) => b.weekend_starts_on.localeCompare(a.weekend_starts_on));
}

export async function loadHotelStaysForWeekend(
  supabase: SupabaseClient,
  weekendId: string
): Promise<HotelStayView[]> {
  const { data, error } = await supabase
    .from("hs_hotel_stays")
    .select(HOTEL_STAY_COLUMNS)
    .eq("weekend_id", weekendId)
    .order("sort_order")
    .order("name");
  if (error) return [];
  return hydrateStays(supabase, (data as HotelStay[] | null) ?? []);
}

export async function loadHotelStaysForSeason(
  supabase: SupabaseClient,
  seasonId: string
): Promise<HotelStayView[]> {
  const { data: weekends } = await supabase.from("hs_weekends").select("id").eq("season_id", seasonId);
  const ids = ((weekends as { id: string }[] | null) ?? []).map((w) => w.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("hs_hotel_stays")
    .select(HOTEL_STAY_COLUMNS)
    .in("weekend_id", ids)
    .order("sort_order")
    .order("name");
  if (error) return [];
  const views = await hydrateStays(supabase, (data as HotelStay[] | null) ?? []);
  return views.sort((a, b) => a.weekend_starts_on.localeCompare(b.weekend_starts_on));
}

export async function loadHotelStaysForContact(
  supabase: SupabaseClient,
  hotelContactId: string
): Promise<HotelStayView[]> {
  const { data, error } = await supabase
    .from("hs_hotel_stays")
    .select(HOTEL_STAY_COLUMNS)
    .eq("hotel_contact_id", hotelContactId)
    .order("created_at", { ascending: false });
  if (error) return [];
  const views = await hydrateStays(supabase, (data as HotelStay[] | null) ?? []);
  return views.sort((a, b) => b.weekend_starts_on.localeCompare(a.weekend_starts_on));
}

export interface HotelStaySeasonPlayer extends StaySiblingPlayer {
  board_id: string;
}

interface HotelStaySeasonPlayerRow {
  id: string;
  board_id: string;
  team_id: string | null;
  full_name: string;
  parent_ids: string[] | null;
}

function asStaySibling(p: HotelStaySeasonPlayerRow): HotelStaySeasonPlayer {
  return {
    id: p.id,
    board_id: p.board_id,
    team_id: p.team_id,
    full_name: p.full_name,
    parent_ids: p.parent_ids ?? [],
  };
}

// Current-season players for hotel-stay tracking. Travel's
// hotel_stay_season_players() RPC (0136) includes families who said no to
// the Directory; staff already see them via RLS. Fallback walks olb_players
// when the RPC isn't applied yet.
export async function loadHotelStaySeasonPlayers(
  supabase: SupabaseClient,
  boardId?: string
): Promise<HotelStaySeasonPlayer[]> {
  const { data, error } = await supabase.rpc("hotel_stay_season_players");
  if (!error && Array.isArray(data) && data.length > 0) {
    return (data as HotelStaySeasonPlayerRow[])
      .filter((p) => !boardId || p.board_id === boardId)
      .map(asStaySibling);
  }
  return loadHotelStaySeasonPlayersViaTable(supabase, boardId);
}

async function loadHotelStaySeasonPlayersViaTable(
  supabase: SupabaseClient,
  boardId?: string
): Promise<HotelStaySeasonPlayer[]> {
  let seasonBoardId = boardId ?? "";
  if (!seasonBoardId) {
    const { data: boards } = await supabase.from("olb_boards").select("id, season").order("season", { ascending: false }).limit(1);
    seasonBoardId = ((boards as { id: string }[] | null) ?? [])[0]?.id ?? "";
    if (!seasonBoardId) return [];
  }
  const { data: ps } = await supabase
    .from("olb_players")
    .select("id, board_id, team_id, full_name")
    .eq("board_id", seasonBoardId)
    .order("full_name");
  const players = (ps as Omit<HotelStaySeasonPlayerRow, "parent_ids">[] | null) ?? [];
  if (players.length === 0) return [];
  const { data: links } = await supabase
    .from("olb_player_parents")
    .select("player_id, member_id")
    .in(
      "player_id",
      players.map((p) => p.id)
    );
  const parentIdsByPlayer = new Map<string, string[]>();
  for (const l of (links as { player_id: string; member_id: string }[] | null) ?? []) {
    const arr = parentIdsByPlayer.get(l.player_id) ?? [];
    arr.push(l.member_id);
    parentIdsByPlayer.set(l.player_id, arr);
  }
  return players.map((p) => ({
    id: p.id,
    board_id: p.board_id,
    team_id: p.team_id,
    full_name: p.full_name,
    parent_ids: parentIdsByPlayer.get(p.id) ?? [],
  }));
}

export async function loadStaySiblingPlayers(
  supabase: SupabaseClient,
  stayId: string,
  playerId: string
): Promise<StaySiblingPlayer[]> {
  const [{ data: stay }, { data: me }] = await Promise.all([
    supabase.from("hs_hotel_stays").select("team_ids").eq("id", stayId).maybeSingle(),
    supabase.from("olb_players").select("id, board_id").eq("id", playerId).maybeSingle(),
  ]);
  if (!stay || !me) return [];
  const players = await loadHotelStaySeasonPlayers(supabase, (me as { board_id: string }).board_id);
  return siblingsOnStay(playerId, { team_ids: (stay as { team_ids: string[] | null }).team_ids }, players);
}

export async function loadHotelStayPlayers(
  supabase: SupabaseClient,
  stayIds: string[]
): Promise<HotelStayPlayer[]> {
  if (stayIds.length === 0) return [];
  const { data, error } = await supabase
    .from("hs_hotel_stay_players")
    .select(HOTEL_STAY_PLAYER_COLUMNS)
    .in("stay_id", stayIds);
  if (error) return [];
  const rows = (data as HotelStayPlayer[] | null) ?? [];
  const names = await loadNames(rows.map((r) => r.marked_by));
  return rows.map((r) => ({ ...r, marked_by_name: r.marked_by ? names.get(r.marked_by) ?? null : null }));
}

export interface HotelOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export async function loadHotelContactOptions(supabase: SupabaseClient): Promise<HotelOption[]> {
  const { data: cats } = await supabase
    .from("contact_categories")
    .select("id, travel_kind")
    .eq("travel_kind", "hotel")
    .is("deleted_at", null);
  const ids = ((cats as { id: string }[] | null) ?? []).map((c) => c.id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("contacts")
    .select("id, name, city, state")
    .eq("kind", "company")
    .in("category_id", ids)
    .is("deleted_at", null)
    .order("name");
  return (data as HotelOption[] | null) ?? [];
}
