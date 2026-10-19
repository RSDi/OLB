// Tournaments we host (0150): the shapes the planning page, its server
// actions and the logic share. A plain module on purpose: exporting types
// from a "use server" file breaks the build. Safe to import from client
// components.

// A day of the tournament: when the first game can start and when the gym
// closes ("14:00", "21:30").
export interface HostedDay {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface HostedPlan {
  weekend_id: string;
  hosted: boolean;
  short_name: string | null;
  finance_event_id: string | null;
  game_minutes: number;
  courts: number;
  days: HostedDay[];
  team_fee_cents: number | null;
  facility: string | null;
  concessions: string | null;
  rules: string | null;
  admission: string | null;
}

export type StepSection = "facility" | "teams" | "officials" | "communication" | "game_day" | "other";

export const STEP_SECTIONS: { key: StepSection; label: string }[] = [
  { key: "facility", label: "Facility" },
  { key: "teams", label: "Teams" },
  { key: "officials", label: "Referees and table" },
  { key: "communication", label: "Communication" },
  { key: "game_day", label: "Game day" },
  { key: "other", label: "Other" },
];

export interface HostedStep {
  id: string;
  weekend_id: string;
  section: StepSection;
  label: string;
  step_key: string | null;
  due_on: string | null;
  done_on: string | null;
  note: string | null;
  sort_order: number;
}

export type DivisionFormat = "pool" | "bracket";

export interface HostedDivision {
  id: string;
  weekend_id: string;
  name: string;
  code: string | null;
  format: DivisionFormat;
  sort_order: number;
}

export interface HostedTeam {
  id: string;
  weekend_id: string;
  division_id: string | null;
  opponent_id: string | null;
  ours: boolean;
  name: string;
  code: string | null;
  seed: number | null;
  fee_cents: number | null;
  note: string | null;
  sort_order: number;
}

export interface HostedGame {
  id: string;
  weekend_id: string;
  division_id: string | null;
  game_no: number;
  round: number;
  label: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_from: string | null; // "W:<game id>" / "L:<game id>"
  away_from: string | null;
  plays_on: string | null;
  starts_at: string | null; // HH:MM[:SS]
  court: number | null;
  home_score: number | null;
  away_score: number | null;
}

export type MoneyKind = "revenue" | "expense";
export type MoneyCategory = "sponsor" | "admission" | "court" | "referee" | "other";

export const MONEY_CATEGORIES: { key: MoneyCategory; kind: MoneyKind; label: string; count: string; each: string }[] = [
  { key: "sponsor", kind: "revenue", label: "Sponsors", count: "Count", each: "Each" },
  { key: "admission", kind: "revenue", label: "Admissions", count: "Count", each: "Pass" },
  { key: "court", kind: "expense", label: "Court fees", count: "Court hours", each: "Per hour" },
  { key: "referee", kind: "expense", label: "Referees", count: "Games", each: "Per game" },
  { key: "other", kind: "revenue", label: "Other income", count: "Count", each: "Each" },
  { key: "other", kind: "expense", label: "Other costs", count: "Count", each: "Each" },
];

export interface HostedMoney {
  id: string;
  weekend_id: string;
  kind: MoneyKind;
  category: MoneyCategory;
  label: string;
  qty: number | null;
  unit_cents: number;
  division_id: string | null;
  note: string | null;
  sort_order: number;
}

export interface HostedMessage {
  id: string;
  subject: string;
  body: string;
  sent_to: string[];
  sent_count: number;
  sent_at: string;
}

// A program coming that weekend (from the HS Schedule), with the emails the
// viewer can see for it (External Contacts: the program and its people).
export interface HostedProgram {
  key: string; // contact id, else the name
  name: string;
  status: "confirmed" | "tentative" | "declined";
  opponent_ids: string[];
  emails: string[];
}

// What Finances has for the tournament: the budget lines and income rows
// tagged with it. Only for those who can see Finances.
export interface HostedFinance {
  canManage: boolean;
  event: { id: string; name: string; board_id: string } | null;
  // The season's tournaments in Finances, to link one.
  events: { id: string; name: string; starts_on: string | null }[];
  lines: { id: string; description: string; budget_cents: number; paid_cents: number }[];
  income: { id: string; description: string; budget_cents: number; amount_cents: number }[];
  links: { money_key: string; budget_line_id: string | null; income_id: string | null; synced_at: string }[];
}

export interface HostedPageData {
  weekend: {
    id: string;
    season_id: string;
    season: number;
    starts_on: string;
    ends_on: string;
    event: string;
    location: string | null;
    status: string;
    facility_contact_id: string | null;
  };
  facilityName: string | null;
  plan: HostedPlan;
  steps: HostedStep[];
  divisions: HostedDivision[];
  teams: HostedTeam[];
  games: HostedGame[];
  money: HostedMoney[];
  messages: HostedMessage[];
  programs: HostedProgram[];
  finance: HostedFinance | null;
  billing: HostedBilling | null;
}

export interface HostedBilling {
  canInvoice: boolean;
  billed: boolean;
  sentCount: number;
  programCount: number;
  allSent: boolean;
  collectedCents: number;
  billedCents: number;
  allCollected: boolean;
}

export type HostedResult = { error?: string; notice?: string; id?: string };

export const PLAN_COLUMNS =
  "weekend_id, hosted, short_name, finance_event_id, game_minutes, courts, days, team_fee_cents, facility, concessions, rules, admission";
export const STEP_COLUMNS = "id, weekend_id, section, label, step_key, due_on, done_on, note, sort_order";
export const DIVISION_COLUMNS = "id, weekend_id, name, code, format, sort_order";
export const TEAM_COLUMNS = "id, weekend_id, division_id, opponent_id, ours, name, code, seed, fee_cents, note, sort_order";
export const GAME_COLUMNS =
  "id, weekend_id, division_id, game_no, round, label, home_team_id, away_team_id, home_from, away_from, plays_on, starts_at, court, home_score, away_score";
export const MONEY_COLUMNS = "id, weekend_id, kind, category, label, qty, unit_cents, division_id, note, sort_order";
