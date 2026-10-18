"use server";

// Hotel stays (0135): Travel and the board set up a stay on an HS Schedule
// weekend (hotel contact, booking instructions) and mark players Booked in
// block from the Directory.

import { revalidatePath } from "next/cache";
import { requireTravelOrStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { loadStaySiblingPlayers } from "./data";
import { cleanHotelStayInput, cleanStayPlayerMark, type HotelStayInput } from "./logic";
import type { HotelStayPlayerStatus } from "./types";

export interface HotelStayResult {
  success?: boolean;
  id?: string;
  error?: string;
}

function refresh(weekendId?: string) {
  revalidatePath("/portal/schedule", "layout");
  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/contacts", "layout");
  if (weekendId) revalidatePath("/portal/schedule");
}

export async function createHotelStay(input: HotelStayInput): Promise<HotelStayResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };
  const c = cleanHotelStayInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const hotelOk = await hotelIsTravelHotel(supabase, c.hotel_contact_id);
  if (!hotelOk) return { error: "Pick a hotel from External Contacts (Hotels type)." };

  const { data, error } = await supabase
    .from("hs_hotel_stays")
    .insert({ ...c, created_by: gate.userId, updated_by: gate.userId })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That hotel is already on this weekend." };
    return { error: error.message };
  }
  refresh(c.weekend_id);
  return { success: true, id: (data as { id: string }).id };
}

export async function updateHotelStay(id: string, input: HotelStayInput): Promise<HotelStayResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };
  const c = cleanHotelStayInput(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const hotelOk = await hotelIsTravelHotel(supabase, c.hotel_contact_id);
  if (!hotelOk) return { error: "Pick a hotel from External Contacts (Hotels type)." };

  const { error } = await supabase
    .from("hs_hotel_stays")
    .update({ ...c, updated_by: gate.userId })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That hotel is already on this weekend." };
    return { error: error.message };
  }
  refresh(c.weekend_id);
  return { success: true, id };
}

export async function deleteHotelStay(id: string): Promise<HotelStayResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data: row } = await supabase.from("hs_hotel_stays").select("weekend_id").eq("id", id).maybeSingle();
  const { error } = await supabase.from("hs_hotel_stays").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh((row as { weekend_id: string } | null)?.weekend_id);
  return { success: true };
}

export interface MarkHotelStayPlayerInput {
  playerId: string;
  stayId: string;
  status: HotelStayPlayerStatus;
  completedOn: string;
  note: string;
  // Other players on this stay who share a parent; ignored unless they really are siblings.
  alsoPlayerIds?: string[];
}

export async function markHotelStayPlayer(input: MarkHotelStayPlayerInput): Promise<HotelStayResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };
  const cleaned = cleanStayPlayerMark({
    status: input.status,
    completedOn: input.completedOn,
    note: input.note,
  });
  if ("error" in cleaned) return { error: cleaned.error };

  const supabase = await createClient();
  const also = await allowedSiblingIds(supabase, input.stayId, input.playerId, input.alsoPlayerIds);
  const rows = [input.playerId, ...also].map((playerId) => ({
    stay_id: input.stayId,
    player_id: playerId,
    status: cleaned.status,
    completed_on: cleaned.completed_on,
    note: cleaned.note,
    marked_by: gate.userId,
  }));
  const { error } = await supabase.from("hs_hotel_stay_players").upsert(rows, { onConflict: "stay_id,player_id" });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function clearHotelStayPlayer(
  playerId: string,
  stayId: string,
  alsoPlayerIds?: string[]
): Promise<HotelStayResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const also = await allowedSiblingIds(supabase, stayId, playerId, alsoPlayerIds);
  const { error } = await supabase
    .from("hs_hotel_stay_players")
    .delete()
    .eq("stay_id", stayId)
    .in("player_id", [playerId, ...also]);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

async function allowedSiblingIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stayId: string,
  playerId: string,
  requested: string[] | undefined
): Promise<string[]> {
  if (!requested?.length) return [];
  const wanted = new Set(requested.filter((id) => id && id !== playerId));
  if (wanted.size === 0) return [];
  const siblings = await loadStaySiblingPlayers(supabase, stayId, playerId);
  return siblings.map((s) => s.id).filter((id) => wanted.has(id));
}

async function hotelIsTravelHotel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("contacts")
    .select("id, kind, category_id, category:contact_categories!category_id(travel_kind)")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as {
    kind: string;
    category?: { travel_kind: string | null } | null;
  } | null;
  return !!row && row.kind === "company" && row.category?.travel_kind === "hotel";
}
