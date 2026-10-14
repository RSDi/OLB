// Hotel stays on HS Schedule weekends (migration 0135): shapes shared by the
// schedule, Directory and External Contacts. Plain module — not "use server".

export type HotelStayStatus = "draft" | "open" | "closed" | "canceled";
export type HotelStayPlayerStatus = "done" | "waived";

export interface HotelStay {
  id: string;
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
  sort_order: number;
  updated_at: string;
}

// Joined fields the Directory and schedule UI show.
export interface HotelStayView extends HotelStay {
  hotel_name: string;
  hotel_city: string | null;
  weekend_event: string;
  weekend_starts_on: string;
  weekend_ends_on: string;
  weekend_location: string | null;
  season: number;
}

export interface HotelStayPlayer {
  stay_id: string;
  player_id: string;
  status: HotelStayPlayerStatus;
  completed_on: string;
  note: string | null;
  marked_by: string | null;
  updated_at: string;
  marked_by_name?: string | null;
}

export const HOTEL_STAY_COLUMNS =
  "id, weekend_id, hotel_contact_id, name, team_ids, booking_instructions, booking_url, booking_code, cutoff_on, rate_notes, status, sort_order, updated_at";

export const HOTEL_STAY_PLAYER_COLUMNS =
  "stay_id, player_id, status, completed_on, note, marked_by, updated_at";

export const HOTEL_STAY_NAME_MAX = 80;
export const HOTEL_STAY_URL_MAX = 500;
export const HOTEL_STAY_CODE_MAX = 80;
