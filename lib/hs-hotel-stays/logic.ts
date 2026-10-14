// Pure helpers for hotel stays: who a stay covers, Booked word, form clean-up.
// Safe to import from client components and node --test.

import {
  HOTEL_STAY_CODE_MAX,
  HOTEL_STAY_NAME_MAX,
  HOTEL_STAY_URL_MAX,
  type HotelStay,
  type HotelStayPlayer,
  type HotelStayStatus,
} from "./types.ts";

export type StayPlayerState = "done" | "waived" | "missing" | "n/a";

export function stayAppliesTo(
  stay: Pick<HotelStay, "team_ids">,
  player: { team_id: string | null }
): boolean {
  if (!stay.team_ids || stay.team_ids.length === 0) return true;
  return player.team_id != null && stay.team_ids.includes(player.team_id);
}

export function stayRowKey(playerId: string, stayId: string): string {
  return `${playerId}:${stayId}`;
}

export function indexStayRows(rows: HotelStayPlayer[]): Map<string, HotelStayPlayer> {
  return new Map(rows.map((r) => [stayRowKey(r.player_id, r.stay_id), r]));
}

export function stayStateFor(
  player: { id: string; team_id: string | null },
  stay: Pick<HotelStay, "id" | "team_ids">,
  rows: Map<string, HotelStayPlayer>
): StayPlayerState {
  if (!stayAppliesTo(stay, player)) return "n/a";
  return rows.get(stayRowKey(player.id, stay.id))?.status ?? "missing";
}

// Always "Booked" for a completed hotel stay (mirrors done_label on requirements).
export function stayDoneWord(): string {
  return "Booked";
}

export function stayStatusLabel(status: HotelStayStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "open":
      return "Open";
    case "closed":
      return "Closed";
    case "canceled":
      return "Canceled";
  }
}

// Short line for Directory filters: "Regionals · Hampton Inn · Mar 12–14".
export function stayFilterLabel(stay: {
  name: string;
  hotel_name: string;
  weekend_starts_on: string;
  weekend_ends_on: string;
}): string {
  const dates = formatStayDates(stay.weekend_starts_on, stay.weekend_ends_on);
  return `${stay.name} · ${stay.hotel_name}${dates ? ` · ${dates}` : ""}`;
}

function formatStayDates(starts: string, ends: string): string {
  const [ys, ms, ds] = starts.split("-").map(Number);
  const [ye, me, de] = ends.split("-").map(Number);
  if (!ys || !ms || !ds) return "";
  const a = new Date(ys, ms - 1, ds);
  const b = ye && me && de ? new Date(ye, me - 1, de) : a;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (a.getTime() === b.getTime()) return a.toLocaleDateString(undefined, opts);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${b.getDate()}`;
  }
  return `${a.toLocaleDateString(undefined, opts)}–${b.toLocaleDateString(undefined, opts)}`;
}

export interface HotelStayInput {
  weekendId: string;
  hotelContactId: string;
  name: string;
  teamIds: string[] | null;
  bookingInstructions: string;
  bookingUrl: string;
  bookingCode: string;
  cutoffOn: string;
  rateNotes: string;
  status: HotelStayStatus;
}

export interface CleanHotelStay {
  weekend_id: string;
  hotel_contact_id: string;
  name: string;
  team_ids: string[] | null;
  booking_instructions: string | null;
  booking_url: string | null;
  booking_code: string | null;
  cutoff_on: string | null;
  rate_notes: string | null;
  status: HotelStayStatus;
}

export function cleanHotelStayInput(input: HotelStayInput): { error: string } | CleanHotelStay {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };
  if (name.length > HOTEL_STAY_NAME_MAX) {
    return { error: `Keep the name to ${HOTEL_STAY_NAME_MAX} characters or fewer.` };
  }
  if (!input.weekendId) return { error: "Pick a weekend on the HS Schedule." };
  if (!input.hotelContactId) return { error: "Pick the hotel in External Contacts." };

  const statuses: HotelStayStatus[] = ["draft", "open", "closed", "canceled"];
  if (!statuses.includes(input.status)) return { error: "Pick a status." };

  const teamIds = input.teamIds && input.teamIds.length > 0 ? [...new Set(input.teamIds)] : null;
  if (input.teamIds && input.teamIds.length === 0) {
    return { error: "Pick at least one team, or choose All players." };
  }

  const bookingUrl = input.bookingUrl.trim();
  if (bookingUrl.length > HOTEL_STAY_URL_MAX) {
    return { error: `Keep the booking link to ${HOTEL_STAY_URL_MAX} characters or fewer.` };
  }
  if (bookingUrl && !/^https?:\/\//i.test(bookingUrl)) {
    return { error: "The booking link should start with http:// or https://." };
  }

  const bookingCode = input.bookingCode.trim();
  if (bookingCode.length > HOTEL_STAY_CODE_MAX) {
    return { error: `Keep the booking code to ${HOTEL_STAY_CODE_MAX} characters or fewer.` };
  }

  const cutoffOn = input.cutoffOn.trim();
  if (cutoffOn && !/^\d{4}-\d{2}-\d{2}$/.test(cutoffOn)) return { error: "Enter a valid cutoff date." };

  return {
    weekend_id: input.weekendId,
    hotel_contact_id: input.hotelContactId,
    name,
    team_ids: teamIds,
    booking_instructions: input.bookingInstructions.trim() || null,
    booking_url: bookingUrl || null,
    booking_code: bookingCode || null,
    cutoff_on: cutoffOn || null,
    rate_notes: input.rateNotes.trim() || null,
    status: input.status,
  };
}
