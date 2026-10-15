"use server";

// Hotel rooming-list import (Travel + board): upload a Group Rooming List PDF
// or CSV, preview best-guess matches, then mark players Booked on a hotel stay.

import { revalidatePath } from "next/cache";
import { requireTravelOrStaff } from "../auth/guards";
import { createClient } from "../supabase/server";
import { createHotelStay, markHotelStayPlayer } from "../hs-hotel-stays/actions";
import { loadHotelContactOptions, loadHotelStaysForSeason } from "../hs-hotel-stays/data";
import { bookingNote, buildMatchPlan, type GuestMatch, type MatchPerson, type MatchWeekend, type RoomingMatchPlan } from "./match";
import { parseRoomingListText, type ParsedRoomingList } from "./parse";

const MAX_BYTES = 4 * 1024 * 1024;

export interface RoomingPreview {
  fileName: string;
  parsed: ParsedRoomingList;
  plan: RoomingMatchPlan;
  alreadyBooked: Record<string, boolean>;
}

export interface RoomingApplyResult {
  success?: boolean;
  stayId?: string;
  marked?: number;
  skipped?: number;
  error?: string;
}

async function extractText(file: File): Promise<{ text: string } | { error: string }> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return { error: "Keep the file under 4 MB." };

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv" || file.type === "text/plain") {
    return { text: buf.toString("utf8") };
  }

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    try {
      // unpdf (pdf.js) works in Node/serverless without browser DOM APIs
      // like DOMMatrix, which pdf-parse needs and Vercel doesn't provide.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const extracted = await extractText(pdf, { mergePages: true });
      const raw = extracted.text as string | string[];
      const text = (Array.isArray(raw) ? raw.join("\n") : raw ?? "").trim();
      if (!text) {
        return {
          error:
            "Couldn't read text from that PDF (it may be a scan). Ask the hotel for a text PDF, or upload a CSV with confirmation, name and dates.",
        };
      }
      return { text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't read that PDF.";
      if (/DOMMatrix|Path2D|OffscreenCanvas|not defined/i.test(msg)) {
        return {
          error:
            "Couldn't read that PDF on the server. Try again, or upload a CSV/TXT export from the hotel instead.",
        };
      }
      return { error: msg };
    }
  }

  return { error: "Upload a Group Rooming List PDF, or a CSV/TXT export." };
}

async function loadMatchContext(supabase: Awaited<ReturnType<typeof createClient>>) {
  const hotels = await loadHotelContactOptions(supabase);

  // Current + next season weekends (rooming lists are often for later events).
  const { data: seasons } = await supabase
    .from("hs_seasons")
    .select("id, season")
    .order("season", { ascending: false })
    .limit(3);
  const seasonRows = (seasons as { id: string; season: number }[] | null) ?? [];
  const seasonIds = seasonRows.map((s) => s.id);
  const seasonOf = new Map(seasonRows.map((s) => [s.id, s.season]));

  let weekends: MatchWeekend[] = [];
  if (seasonIds.length) {
    const { data: ws } = await supabase
      .from("hs_weekends")
      .select("id, season_id, starts_on, ends_on, event, location")
      .in("season_id", seasonIds)
      .order("starts_on");
    weekends = ((ws as { id: string; season_id: string; starts_on: string; ends_on: string; event: string; location: string | null }[] | null) ?? [])
      .map((w) => ({
        id: w.id,
        seasonId: w.season_id,
        season: seasonOf.get(w.season_id) ?? 0,
        event: w.event,
        startsOn: w.starts_on,
        endsOn: w.ends_on,
        location: w.location,
      }))
      .filter((w) => w.season > 0);
  }

  const stays = (
    await Promise.all(seasonIds.map((id) => loadHotelStaysForSeason(supabase, id)))
  ).flat().map((s) => ({
    id: s.id,
    weekendId: s.weekend_id,
    hotelContactId: s.hotel_contact_id,
    name: s.name,
    status: s.status,
  }));

  // Players + parents on the latest season board (same idea as the Directory).
  const people: MatchPerson[] = [];
  const { data: playerRaw } = await supabase
    .from("olb_players")
    .select("id, full_name, team_id, board:olb_boards(season)")
    .order("full_name");
  const allPlayers =
    (playerRaw as { id: string; full_name: string; team_id: string | null; board: { season: string } | null }[] | null) ??
    [];
  const season = allPlayers.reduce((max, p) => ((p.board?.season ?? "") > max ? p.board!.season : max), "");
  const playerRows = season ? allPlayers.filter((p) => p.board?.season === season) : allPlayers;
  for (const p of playerRows) {
    people.push({
      kind: "player",
      id: p.id,
      name: p.full_name,
      playerIds: [p.id],
      teamId: p.team_id,
    });
  }
  const playerIds = playerRows.map((p) => p.id);
  if (playerIds.length) {
    const { data: links } = await supabase
      .from("olb_player_parents")
      .select("player_id, member:members(id, full_name, deleted_at)")
      .in("player_id", playerIds);
    const byMember = new Map<string, { name: string; playerIds: string[] }>();
    for (const row of (links as {
      player_id: string;
      member: { id: string; full_name: string | null; deleted_at: string | null } | null;
    }[] | null) ?? []) {
      const m = row.member;
      if (!m || m.deleted_at || !m.full_name?.trim()) continue;
      const cur = byMember.get(m.id) ?? { name: m.full_name.trim(), playerIds: [] };
      if (!cur.playerIds.includes(row.player_id)) cur.playerIds.push(row.player_id);
      byMember.set(m.id, cur);
    }
    for (const [id, v] of byMember) {
      people.push({
        kind: "parent",
        id,
        name: v.name,
        playerIds: v.playerIds,
        teamId: null,
      });
    }
  }

  return {
    hotels: hotels.map((h) => ({ id: h.id, name: h.name, city: h.city })),
    weekends,
    stays,
    people,
  };
}

export async function previewRoomingImport(form: FormData): Promise<RoomingPreview | { error: string }> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a rooming list file." };

  const extracted = await extractText(file);
  if ("error" in extracted) return extracted;

  const parsed = parseRoomingListText(extracted.text);
  if (parsed.guests.length === 0) {
    return { error: parsed.warnings[0] ?? "No guests found in that file." };
  }

  const supabase = await createClient();
  const ctx = await loadMatchContext(supabase);
  const plan = buildMatchPlan(parsed, ctx.hotels, ctx.weekends, ctx.stays, ctx.people);

  const stayId = plan.stay.pick?.id;
  const alreadyBooked: Record<string, boolean> = {};
  if (stayId) {
    const playerIds = [...new Set(plan.guests.flatMap((g) => g.playerIds))];
    if (playerIds.length) {
      const { data } = await supabase
        .from("hs_hotel_stay_players")
        .select("player_id, status")
        .eq("stay_id", stayId)
        .in("player_id", playerIds);
      for (const r of (data as { player_id: string; status: string }[] | null) ?? []) {
        if (r.status === "done") alreadyBooked[r.player_id] = true;
      }
    }
  }

  return { fileName: file.name, parsed, plan, alreadyBooked };
}

export interface RoomingApplyInput {
  stayId: string | null;
  // Create a stay when none was picked.
  createStay?: {
    weekendId: string;
    hotelContactId: string;
    name: string;
    bookingCode: string;
    bookingInstructions: string;
  } | null;
  // Guest confirmation → player ids to mark (empty skips).
  marks: { confirmation: string; playerIds: string[]; note?: string }[];
  guests: GuestMatch["guest"][];
}

export async function applyRoomingImport(input: RoomingApplyInput): Promise<RoomingApplyResult> {
  const gate = await requireTravelOrStaff();
  if ("error" in gate) return { error: gate.error };

  let stayId = input.stayId;
  if (!stayId && input.createStay) {
    const created = await createHotelStay({
      weekendId: input.createStay.weekendId,
      hotelContactId: input.createStay.hotelContactId,
      name: input.createStay.name,
      teamIds: null,
      bookingInstructions: input.createStay.bookingInstructions,
      bookingUrl: "",
      bookingCode: input.createStay.bookingCode,
      cutoffOn: "",
      rateNotes: "",
      status: "open",
    });
    if (created.error || !created.id) return { error: created.error ?? "Couldn't create the hotel stay." };
    stayId = created.id;
  }
  if (!stayId) return { error: "Pick or create a hotel stay for this list." };

  const byConf = new Map(input.guests.map((g) => [g.confirmation, g]));
  // One mark per player: merge notes when several rooms map to the same kid.
  const notesByPlayer = new Map<string, string[]>();
  for (const m of input.marks) {
    if (!m.playerIds.length) continue;
    const guest = byConf.get(m.confirmation);
    const note = m.note?.trim() || (guest ? bookingNote(guest) : `Conf #${m.confirmation}`);
    for (const pid of m.playerIds) {
      const list = notesByPlayer.get(pid) ?? [];
      if (!list.includes(note)) list.push(note);
      notesByPlayer.set(pid, list);
    }
  }

  const today = new Date();
  const completedOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  let marked = 0;
  let skipped = 0;
  for (const [playerId, notes] of notesByPlayer) {
    const result = await markHotelStayPlayer({
      playerId,
      stayId,
      status: "done",
      completedOn,
      note: notes.join(" · "),
    });
    if (result.error) {
      skipped++;
      continue;
    }
    marked++;
  }

  revalidatePath("/portal/directory", "layout");
  revalidatePath("/portal/schedule", "layout");
  revalidatePath("/portal/contacts", "layout");
  revalidatePath("/portal/settings", "layout");

  return { success: true, stayId, marked, skipped };
}
