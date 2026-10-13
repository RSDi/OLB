// Club finances (0131): the shapes the Budget, Income, Programs, Fundraising
// and Snapshot tabs, their server actions and the logic share. A plain module
// on purpose: exporting types from a "use server" file breaks the build.

import type { FeeTier } from "./fees.ts";

export type ExpenseMethod = "check" | "card" | "venmo" | "cash" | "transfer" | "other";

export const EXPENSE_METHODS: { key: ExpenseMethod; label: string }[] = [
  { key: "check", label: "Check" },
  { key: "card", label: "Card" },
  { key: "venmo", label: "Venmo" },
  { key: "cash", label: "Cash" },
  { key: "transfer", label: "Bank transfer" },
  { key: "other", label: "Other" },
];

export type IncomeCategory = "donation" | "sponsor" | "event" | "program" | "vendor_credit" | "merch" | "fundraiser" | "other";

export const INCOME_CATEGORIES: { key: IncomeCategory; label: string }[] = [
  { key: "donation", label: "Donation" },
  { key: "sponsor", label: "Sponsor" },
  { key: "event", label: "Tournament we host" },
  { key: "program", label: "Clinic or workout" },
  { key: "fundraiser", label: "Fundraiser" },
  { key: "merch", label: "Shirts and gear sold" },
  { key: "vendor_credit", label: "Credit from a vendor" },
  { key: "other", label: "Other" },
];

export type ProgramKind = "clinic" | "workout" | "camp" | "other";

export const PROGRAM_KINDS: { key: ProgramKind; label: string }[] = [
  { key: "clinic", label: "Clinic" },
  { key: "workout", label: "Workouts" },
  { key: "camp", label: "Camp" },
  { key: "other", label: "Other" },
];

// What a new season starts with. Each can be renamed or added to.
export const DEFAULT_BUDGET_GROUPS = ["General", "Subscriptions", "Practice gyms", "Teams", "Programs", "Uniforms & gear", "Events"];
// The club's general program fund. Buckets for Bucks is a fundraiser whose
// earnings go to it, not the fund itself.
export const GENERAL_FUND = "General program fund";
export const DEFAULT_FUNDS = [{ name: GENERAL_FUND, description: "Program costs for the whole club. Buckets for Bucks raises money for it." }];
export const DEFAULT_FUNDRAISERS = [
  { name: "Nelson's Produce", rate_cents: 1000 },
  { name: "Buckets for Bucks", rate_cents: 0 },
];

export interface FinanceSettings {
  board_id: string;
  enabled: boolean;
  fee_tiers: FeeTier[];
  // Whether Settings saved tiers of its own (otherwise the built-in ones).
  custom_tiers: boolean;
  comp_coach_kids: boolean;
  coach_comp_cents: number | null; // null: the whole registration fee
  fundraising_rate_cents: number;
  default_due_on: string | null;
}

export interface BudgetGroup {
  id: string;
  name: string;
  sort_order: number;
}

export interface BudgetLine {
  id: string;
  group_id: string;
  team_id: string | null;
  program_id: string | null;
  event_id: string | null;
  vendor: string | null;
  description: string;
  month: string | null; // YYYY-MM-01
  budget_cents: number;
  note: string | null;
  created_at: string;
  voided_at: string | null;
}

export interface ExpensePayment {
  id: string;
  line_id: string;
  amount_cents: number;
  paid_on: string;
  method: ExpenseMethod;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  voided_at: string | null;
}

export interface IncomeRow {
  id: string;
  category: IncomeCategory;
  program_id: string | null;
  event_id: string | null;
  fund_id: string | null;
  from_name: string | null;
  description: string;
  amount_cents: number; // received; 0 while only expected
  received_on: string | null;
  budget_cents: number | null;
  method: ExpenseMethod | null;
  reference: string | null;
  note: string | null;
  voided_at: string | null;
}

export interface HostedEvent {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  note: string | null;
  archived_at: string | null;
}

export interface ProgramLevel {
  label: string;
  cents: number;
}

export interface Program {
  id: string;
  name: string;
  kind: ProgramKind;
  starts_on: string | null;
  ends_on: string | null;
  schedule: string | null;
  location: string | null;
  description: string | null;
  levels: ProgramLevel[];
  open: boolean;
  capacity: number | null;
  archived_at: string | null;
}

export type SignupPaidMethod = "venmo" | "check" | "cash" | "card" | "other" | "waived";

export interface ProgramSignup {
  id: string;
  program_id: string;
  player_id: string | null;
  child_first: string;
  child_last: string;
  child_dob: string | null;
  level: string | null;
  price_cents: number;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  note: string | null;
  charge_id: string | null;
  paid_cents: number;
  paid_on: string | null;
  paid_method: SignupPaidMethod | null;
  paid_ref: string | null;
  created_at: string;
  cancelled_at: string | null;
}

export interface Fund {
  id: string;
  name: string;
  description: string | null;
  archived_at: string | null;
}

export interface Fundraiser {
  id: string;
  name: string;
  rate_cents: number;
  archived_at: string | null;
}

export type ShiftDestination = "family" | "fund";

export interface Shift {
  id: string;
  fundraiser_id: string;
  event_label: string | null;
  worked_on: string | null;
  worker_name: string;
  hours: number;
  amount_cents: number;
  destination: ShiftDestination;
  player_id: string | null;
  fund_id: string | null;
  charge_id: string | null;
  note: string | null;
  created_at: string;
  voided_at: string | null;
}

// A player, as the tabs' pickers and the team split need them.
export interface ClubPlayer {
  id: string;
  full_name: string;
  team_id: string | null;
}

export interface ClubTeam {
  id: string;
  name: string;
}

// What the Budget, Income, Programs and Fundraising tabs load.
export interface ClubData {
  board: { id: string; season: string };
  settings: FinanceSettings;
  groups: BudgetGroup[];
  lines: BudgetLine[];
  expensePayments: ExpensePayment[];
  lineCharges: { line_id: string; charge_id: string; amount_cents: number; voided: boolean }[];
  income: IncomeRow[];
  events: HostedEvent[];
  programs: Program[];
  signups: ProgramSignup[];
  // The program charges on families' accounts, so a sign-up shows paid or not.
  signupCharges: { id: string; player_id: string; amount_cents: number; voided_at: string | null }[];
  funds: Fund[];
  fundraisers: Fundraiser[];
  shifts: Shift[];
  teams: ClubTeam[];
  players: ClubPlayer[];
  // The families' side, added up: charged, taken off, paid, still owed.
  families: { charged: number; credited: number; paid: number; owed: number; owing: number };
}

export const LINE_COLUMNS = "id, group_id, team_id, program_id, event_id, vendor, description, month, budget_cents, note, created_at, voided_at";
export const EXPENSE_PAYMENT_COLUMNS = "id, line_id, amount_cents, paid_on, method, reference, note, recorded_by, voided_at";
export const INCOME_COLUMNS =
  "id, category, program_id, event_id, fund_id, from_name, description, amount_cents, received_on, budget_cents, method, reference, note, voided_at";
export const PROGRAM_COLUMNS = "id, name, kind, starts_on, ends_on, schedule, location, description, levels, open, capacity, archived_at";
export const SIGNUP_COLUMNS =
  "id, program_id, player_id, child_first, child_last, child_dob, level, price_cents, parent_name, parent_email, parent_phone, note, charge_id, paid_cents, paid_on, paid_method, paid_ref, created_at, cancelled_at";
export const SHIFT_COLUMNS =
  "id, fundraiser_id, event_label, worked_on, worker_name, hours, amount_cents, destination, player_id, fund_id, charge_id, note, created_at, voided_at";
