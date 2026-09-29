// Payments (migration 0101): the shapes shared by the Payments page, the
// server actions and the logic. A plain module on purpose — exporting types
// from a "use server" file breaks the build.

export type ChargeKind = "charge" | "credit";

// What a family owes for…
export type ChargeCategory = "registration" | "uniform" | "tournament" | "refund" | "other";
// …and what's taken off.
export type CreditCategory = "covered" | "scholarship" | "adjustment";

export type PaymentMethod = "venmo" | "check" | "cash" | "card" | "other";

export const CHARGE_CATEGORIES: { key: ChargeCategory; label: string }[] = [
  { key: "registration", label: "Registration fee" },
  { key: "uniform", label: "Uniform" },
  { key: "tournament", label: "Tournament" },
  { key: "refund", label: "Refund paid out" },
  { key: "other", label: "Other" },
];

export const CREDIT_CATEGORIES: { key: CreditCategory; label: string }[] = [
  { key: "covered", label: "Covered by the club" },
  { key: "scholarship", label: "Scholarship" },
  { key: "adjustment", label: "Adjustment" },
];

export const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "venmo", label: "Venmo" },
  { key: "check", label: "Check" },
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "other", label: "Other" },
];

// A charge or a credit on one player.
export interface Charge {
  id: string;
  player_id: string;
  kind: ChargeKind;
  category: ChargeCategory | CreditCategory;
  description: string;
  amount_cents: number;
  entry_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
}

// Money received for one player. Rows sharing a group_id are one Venmo or
// check that covered several players.
export interface Payment {
  id: string;
  group_id: string;
  player_id: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  voided_at: string | null;
}

// ─── What the Payments page loads (lib/finances/data.ts) ─────────────────────

export interface PaymentsBoard {
  id: string;
  season: string;
  parent_balances_visible: boolean;
}

export interface PaymentsPlayer {
  id: string;
  full_name: string;
  age_group: string | null;
  registration_fee: string | null;
  payment_method: string | null;
  registered_at: string | null;
  team: { id: string; name: string; age_group: string | null; color: string | null } | null;
  parents: {
    relationship: "father" | "mother" | "guardian";
    member: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  }[];
}

export interface PaymentsData {
  board: PaymentsBoard;
  players: PaymentsPlayer[];
  charges: Charge[];
  payments: Payment[];
  // Who entered what: auth user id → name.
  names: Record<string, string>;
}

export const CHARGE_COLUMNS =
  "id, player_id, kind, category, description, amount_cents, entry_date, note, created_by, created_at, voided_at";

export const PAYMENT_COLUMNS =
  "id, group_id, player_id, amount_cents, paid_on, method, reference, note, recorded_by, created_at, voided_at";

export const DESCRIPTION_MAX = 120;
export const NOTE_MAX = 500;
export const REFERENCE_MAX = 80;

// The season's registration fees by age tier, as the registration form and
// the Programs page list them. Age as of August 1.
export const REGISTRATION_FEES: { tier: string; cents: number }[] = [
  { tier: "8u-12u", cents: 37500 },
  { tier: "14u", cents: 40000 },
  { tier: "16u-18u", cents: 52500 },
];

// Where parents send money, shown with their balance.
export const PAYMENT_INSTRUCTIONS = {
  venmoHandle: "@OmahaLightning-Basketball",
  venmoUrl: "https://account.venmo.com/u/OmahaLightning-Basketball",
  email: "lightningbasketballomaha@gmail.com",
};
