// Payments: families, balances, splitting a payment across a family's
// players, and the clean-up the forms and the server actions share. Pure and
// safe to import from client components.

import { formatAmount, parseAmount } from "../requirements/logic.ts"; // explicit extension so node --test can load this file
import {
  CHARGE_CATEGORIES,
  CREDIT_CATEGORIES,
  DESCRIPTION_MAX,
  NOTE_MAX,
  PAYMENT_METHODS,
  REFERENCE_MAX,
  REGISTRATION_FEES,
  type Charge,
  type ChargeKind,
  type Payment,
  type PaymentMethod,
  type PaymentsPlayer,
} from "./types.ts";

export { formatAmount, parseAmount };

// "$30,800" for a whole-dollar amount, "$37.50" otherwise: for the totals
// tiles, where space is tight.
export function formatDollars(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : formatAmount(cents);
}

// ─── Registration fees ──────────────────────────────────────────────────────

// A player's registration fee in cents, from what their registration says:
// the form's "8u-12u - $375.00", or Cognito's bare tier "16u-18u". Null when
// it names neither an amount nor a tier.
export function registrationFeeCents(fee: string | null | undefined): number | null {
  const s = fee?.trim();
  if (!s) return null;
  const dollars = s.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  if (dollars) return parseAmount(dollars[1]);
  const tier = registrationTier(s);
  return tier ? REGISTRATION_FEES.find((f) => f.tier === tier)!.cents : null;
}

// "8u-12u - $375.00" → "8u-12u". Null when no tier is named.
export function registrationTier(fee: string | null | undefined): string | null {
  const s = (fee ?? "").toLowerCase().replace(/\s+/g, "");
  // Longest first, so "16u-18u" isn't read as some shorter tier inside it.
  const tiers = [...REGISTRATION_FEES].sort((a, b) => b.tier.length - a.tier.length);
  return tiers.find((f) => s.startsWith(f.tier.toLowerCase()))?.tier ?? null;
}

// ─── Families ───────────────────────────────────────────────────────────────

export interface FamilyPlayer {
  id: string;
  full_name: string;
  // Parent members' ids. Siblings share at least one.
  parent_ids: string[];
}

// Players grouped into families: players who share a parent are one family,
// and so are their other parents' players (a blended family is one account).
// A player with no parents is a family of one. Families keep the order of
// their first player in the input.
export function groupFamilies<P extends FamilyPlayer>(players: P[]): P[][] {
  const root = new Map<string, string>(); // player id → representative
  const find = (id: string): string => {
    let r = id;
    while (root.get(r) !== r) r = root.get(r)!;
    root.set(id, r);
    return r;
  };
  for (const p of players) root.set(p.id, p.id);
  const byParent = new Map<string, string>(); // parent id → first player seen
  for (const p of players) {
    for (const parent of p.parent_ids) {
      const other = byParent.get(parent);
      if (other) root.set(find(p.id), find(other));
      else byParent.set(parent, p.id);
    }
  }
  const families = new Map<string, P[]>();
  for (const p of players) {
    const r = find(p.id);
    if (!families.has(r)) families.set(r, []);
    families.get(r)!.push(p);
  }
  return [...families.values()];
}

// Everything after the first name: "Caleb Van Schooneveld" → "Van Schooneveld".
export function lastName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  return words.length > 1 ? words.slice(1).join(" ") : words[0] ?? "";
}

// "Goeller", or "Smith / Jones" when the kids' last names differ.
export function familyName(players: { full_name: string }[]): string {
  const names = [...new Set(players.map((p) => lastName(p.full_name)).filter(Boolean))];
  return names.join(" / ") || "Family";
}

// ─── Balances ───────────────────────────────────────────────────────────────

export interface Totals {
  charged: number; // cents: registration, uniforms, tournaments, refunds out
  credited: number; // cents: covered by the club, scholarships, adjustments
  paid: number; // cents received
  balance: number; // charged − credited − paid; negative = the family is owed
}

export const ZERO: Totals = { charged: 0, credited: 0, paid: 0, balance: 0 };

// Totals for a set of players. Voided entries don't count.
export function totalsFor(
  playerIds: Iterable<string>,
  charges: Pick<Charge, "player_id" | "kind" | "amount_cents" | "voided_at">[],
  payments: Pick<Payment, "player_id" | "amount_cents" | "voided_at">[]
): Totals {
  const ids = new Set(playerIds);
  let charged = 0;
  let credited = 0;
  let paid = 0;
  for (const c of charges) {
    if (c.voided_at || !ids.has(c.player_id)) continue;
    if (c.kind === "credit") credited += c.amount_cents;
    else charged += c.amount_cents;
  }
  for (const p of payments) {
    if (p.voided_at || !ids.has(p.player_id)) continue;
    paid += p.amount_cents;
  }
  return { charged, credited, paid, balance: charged - credited - paid };
}

export type BalanceState = "owes" | "paid" | "credit" | "none";

// Where an account stands: nothing charged yet, owes money, paid up, or paid
// more than it owes.
export function balanceState(t: Totals): BalanceState {
  if (t.balance > 0) return "owes";
  if (t.balance < 0) return "credit";
  return t.charged === 0 && t.credited === 0 && t.paid === 0 ? "none" : "paid";
}

export function balanceLabel(t: Totals): string {
  switch (balanceState(t)) {
    case "owes":
      return `Owes ${formatAmount(t.balance)}`;
    case "credit":
      return `Credit ${formatAmount(-t.balance)}`;
    case "paid":
      return "Paid up";
    default:
      return "Nothing charged";
  }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

export interface AccountParent {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

// One family's account on the Payments page: their players, parents, what's
// on it, and the totals for the family and for each player.
export interface Account {
  key: string; // the first player's id
  name: string;
  players: PaymentsPlayer[];
  parents: AccountParent[];
  charges: Charge[];
  payments: Payment[];
  totals: Totals;
  byPlayer: Map<string, Totals>;
}

// Families with their entries, sorted by family name.
export function buildAccounts(players: PaymentsPlayer[], charges: Charge[], payments: Payment[]): Account[] {
  const byId = new Map(players.map((p) => [p.id, p]));
  const withParents = players.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    parent_ids: p.parents.map((pa) => pa.member?.id).filter((id): id is string => !!id),
  }));
  return groupFamilies(withParents)
    .map((members) => {
      const family = members.map((m) => byId.get(m.id)!);
      const ids = new Set(family.map((p) => p.id));
      const parents = new Map<string, AccountParent>();
      for (const p of family) for (const pa of p.parents) if (pa.member) parents.set(pa.member.id, pa.member);
      const mine = {
        charges: charges.filter((c) => ids.has(c.player_id)),
        payments: payments.filter((p) => ids.has(p.player_id)),
      };
      return {
        key: family[0].id,
        name: familyName(family),
        players: family,
        parents: [...parents.values()],
        ...mine,
        totals: totalsFor(ids, mine.charges, mine.payments),
        byPlayer: new Map(family.map((p) => [p.id, totalsFor([p.id], mine.charges, mine.payments)])),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Every account's totals added up.
export function sumTotals(accounts: { totals: Totals }[]): Totals {
  return accounts.reduce(
    (t, a) => ({
      charged: t.charged + a.totals.charged,
      credited: t.credited + a.totals.credited,
      paid: t.paid + a.totals.paid,
      balance: t.balance + a.totals.balance,
    }),
    ZERO
  );
}

// One Venmo or check, with its split across players. Voided payments are
// voided as a whole, so a group is voided when its rows are.
export interface PaymentGroup {
  group_id: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
  voided: boolean;
  amount_cents: number;
  splits: Split[];
}

export function groupPayments(payments: Payment[]): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();
  for (const p of payments) {
    let g = groups.get(p.group_id);
    if (!g) {
      g = {
        group_id: p.group_id,
        paid_on: p.paid_on,
        method: p.method,
        reference: p.reference,
        note: p.note,
        recorded_by: p.recorded_by,
        voided: !!p.voided_at,
        amount_cents: 0,
        splits: [],
      };
      groups.set(p.group_id, g);
    }
    g.amount_cents += p.amount_cents;
    g.splits.push({ player_id: p.player_id, amount_cents: p.amount_cents });
  }
  return [...groups.values()].sort((a, b) => b.paid_on.localeCompare(a.paid_on));
}

export function methodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.key === method)?.label ?? method;
}

// ─── Splitting a payment ────────────────────────────────────────────────────

export interface Split {
  player_id: string;
  amount_cents: number;
}

// One payment across a family's players: each player's balance is paid off
// in the order given, and anything left over goes on the first player (a
// credit on the account). Players with nothing owing get nothing unless the
// payment is more than the family owes.
export function splitPayment(amountCents: number, owed: { player_id: string; balance: number }[]): Split[] {
  if (amountCents <= 0 || owed.length === 0) return [];
  let left = amountCents;
  const out = owed.map((o) => {
    const take = Math.min(left, Math.max(0, o.balance));
    left -= take;
    return { player_id: o.player_id, amount_cents: take };
  });
  out[0].amount_cents += left;
  return out.filter((s) => s.amount_cents > 0);
}

// ─── Input clean-up ─────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(raw: string | null | undefined, max: number): string | null {
  const s = (raw ?? "").trim();
  return s ? s.slice(0, max) : null;
}

export interface ChargeInput {
  player_ids: string[];
  kind: ChargeKind;
  category: string;
  description: string;
  amount: string; // "$375", "375.00"
  entry_date: string;
  note: string;
}

export interface CleanCharge {
  player_ids: string[];
  kind: ChargeKind;
  category: string;
  description: string;
  amount_cents: number;
  entry_date: string;
  note: string | null;
}

export function categoryLabel(kind: ChargeKind, category: string): string {
  const list = kind === "credit" ? CREDIT_CATEGORIES : CHARGE_CATEGORIES;
  return list.find((c) => c.key === category)?.label ?? category;
}

export function cleanChargeInput(input: ChargeInput): CleanCharge | { error: string } {
  const player_ids = [...new Set(input.player_ids.filter(Boolean))];
  if (player_ids.length === 0) return { error: "Pick at least one player." };
  if (input.kind !== "charge" && input.kind !== "credit") return { error: "Pick a charge or a credit." };
  const list = input.kind === "credit" ? CREDIT_CATEGORIES : CHARGE_CATEGORIES;
  if (!list.some((c) => c.key === input.category)) return { error: "Pick what it's for." };
  const amount_cents = parseAmount(input.amount);
  if (amount_cents == null || amount_cents <= 0) return { error: "Enter an amount, like 375 or 37.50." };
  if (!ISO_DAY.test(input.entry_date)) return { error: "Pick a date." };
  const description = cleanText(input.description, DESCRIPTION_MAX) ?? categoryLabel(input.kind, input.category);
  return {
    player_ids,
    kind: input.kind,
    category: input.category,
    description,
    amount_cents,
    entry_date: input.entry_date,
    note: cleanText(input.note, NOTE_MAX),
  };
}

export interface PaymentInput {
  splits: Split[];
  paid_on: string;
  method: string;
  reference: string;
  note: string;
}

export interface CleanPayment {
  splits: Split[];
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}

export function cleanPaymentInput(input: PaymentInput): CleanPayment | { error: string } {
  const merged = new Map<string, number>();
  for (const s of input.splits) {
    if (!s.player_id) continue;
    if (!Number.isInteger(s.amount_cents) || s.amount_cents < 0) return { error: "Each player's share must be an amount." };
    merged.set(s.player_id, (merged.get(s.player_id) ?? 0) + s.amount_cents);
  }
  const splits = [...merged].map(([player_id, amount_cents]) => ({ player_id, amount_cents })).filter((s) => s.amount_cents > 0);
  if (splits.length === 0) return { error: "Enter how much was paid." };
  if (!PAYMENT_METHODS.some((m) => m.key === input.method)) return { error: "Pick how they paid." };
  if (!ISO_DAY.test(input.paid_on)) return { error: "Pick the date it was paid." };
  return {
    splits,
    paid_on: input.paid_on,
    method: input.method as PaymentMethod,
    reference: cleanText(input.reference, REFERENCE_MAX),
    note: cleanText(input.note, NOTE_MAX),
  };
}

// ─── Spreadsheet export ─────────────────────────────────────────────────────

export interface LedgerRow {
  date: string;
  family: string;
  player: string;
  type: string; // "Charge", "Credit", "Payment"
  what: string;
  method: string;
  reference: string;
  amount_cents: number; // charges positive; credits and payments negative
  note: string;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Every entry as CSV, for the Treasurer's own spreadsheet. Amounts are plain
// numbers (no $) so a spreadsheet can add them up.
export function ledgerCsv(rows: LedgerRow[]): string {
  const header = ["Date", "Family", "Player", "Type", "What", "Method", "Reference", "Amount", "Note"];
  const lines = rows.map((r) =>
    [r.date, r.family, r.player, r.type, r.what, r.method, r.reference, (r.amount_cents / 100).toFixed(2), r.note]
      .map(csvCell)
      .join(",")
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}
