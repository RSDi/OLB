// Shared types for the HS Schedule (migration 0108). A plain module, not
// "use server" (exporting types from a "use server" file breaks this Next.js
// build), so client components can import it too.

// How a weekend stands, as the spreadsheet colors it. "planned" is a row with
// nothing flagged; "off" is a holiday or open weekend with no games.
export type HsWeekendStatus =
  | "planned"
  | "tentative"
  | "need_facility"
  | "in_process"
  | "secured"
  | "canceled"
  | "off";

// A team coming to a weekend: confirmed, on the fence, or not coming.
export type HsOpponentStatus = "confirmed" | "tentative" | "declined";

export interface HsSeason {
  id: string;
  season: number; // the year it starts: 2026 = 2026–27
  title: string;
  notes: string | null;
  imported_from: string | null;
  imported_at: string | null;
}

// One of our teams on the season's schedule (a column): "V", "JV1", "14U A".
export interface HsLevel {
  id: string;
  season_id: string;
  label: string;
  name: string | null;
  team_id: string | null;
  hidden: boolean;
  sort_order: number;
}

export interface HsWeekend {
  id: string;
  season_id: string;
  starts_on: string; // YYYY-MM-DD
  ends_on: string;
  event: string;
  details: string | null;
  location: string | null;
  trip: string | null;
  status: HsWeekendStatus;
  notes: string | null;
  facility_contact_id: string | null;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
}

// A cell: how many games one of our teams plays that weekend.
export interface HsGames {
  weekend_id: string;
  level_id: string;
  games: number | null;
  unsure: boolean;
  note: string | null;
}

export interface HsOpponent {
  id: string;
  weekend_id: string;
  level_id: string | null; // null: coming for every team we bring
  contact_id: string | null;
  name: string;
  status: HsOpponentStatus;
  our_score: number | null;
  their_score: number | null;
  note: string | null;
  sort_order: number;
}

// What a linked program shows in the schedule. Only the board can read
// External Contacts, so for coaches this stays empty and `name` stands in.
export interface HsContactRef {
  id: string;
  name: string;
  nickname: string | null;
  city: string | null;
  state: string | null;
  team_colors: string | null;
  email: string | null;
  phone: string | null;
}

// Everything the schedule page needs for one season.
export interface HsSeasonSchedule {
  season: HsSeason;
  levels: HsLevel[];
  weekends: HsWeekend[];
  games: HsGames[];
  opponents: HsOpponent[];
  contacts: HsContactRef[];
}

// A program or facility the pickers offer (External Contacts, board only).
export interface HsContactOption {
  id: string;
  name: string;
  nickname: string | null;
  aliases: string[];
  city: string | null;
  state: string | null;
  category: string | null;
}

export type HsActionResult = { error?: string; id?: string };

export interface HsWeekendInput {
  starts_on: string;
  ends_on: string;
  event: string;
  details: string | null;
  location: string | null;
  trip: string | null;
  status: HsWeekendStatus;
  notes: string | null;
  facility_contact_id: string | null;
}

export interface HsOpponentInput {
  weekend_id: string;
  level_id: string | null;
  contact_id: string | null;
  name: string;
  status: HsOpponentStatus;
  our_score?: number | null;
  their_score?: number | null;
  note?: string | null;
}

export interface HsLevelInput {
  label: string;
  name: string | null;
  team_id: string | null;
  hidden: boolean;
}
