// Club finances (0131): budget vs paid, team and program and event totals,
// splitting a cost across a team, fundraiser shifts, the Snapshot, and the
// clean-up the forms and the server actions share. Pure and safe to import
// from client components.

import { formatAmount, parseAmount } from "../requirements/logic.ts"; // explicit extension so node --test can load this file
import { splitPayment } from "./logic.ts";
import {
  EXPENSE_METHODS,
  INCOME_CATEGORIES,
  PROGRAM_KINDS,
  type BudgetGroup,
  type BudgetLine,
  type ClubData,
  type ExpenseMethod,
  type ExpensePayment,
  type IncomeCategory,
  type ProgramKind,
  type ProgramLevel,
  type ProgramSignup,
  type ShiftDestination,
} from "./club-types.ts";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function clean(raw: string | null | undefined, max: number): string | null {
  const s = (raw ?? "").trim();
  return s ? s.slice(0, max) : null;
}

// ─── Budget vs paid ─────────────────────────────────────────────────────────

export interface Spend {
  budget: number;
  paid: number;
}

export const NO_SPEND: Spend = { budget: 0, paid: 0 };

// What's been paid on each line (voided payments and lines don't count).
export function paidByLine(payments: Pick<ExpensePayment, "line_id" | "amount_cents" | "voided_at">[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) if (!p.voided_at) out.set(p.line_id, (out.get(p.line_id) ?? 0) + p.amount_cents);
  return out;
}

export function spendOf(lines: Pick<BudgetLine, "id" | "budget_cents" | "voided_at">[], paid: Map<string, number>): Spend {
  let budget = 0;
  let total = 0;
  for (const l of lines) {
    if (l.voided_at) continue;
    budget += l.budget_cents;
    total += paid.get(l.id) ?? 0;
  }
  return { budget, paid: total };
}

// "Over budget" when more's been paid than budgeted on something that had a
// budget; a line with no budget (an unplanned cost) is just unplanned.
export function overBudget(s: Spend): boolean {
  return s.budget > 0 && s.paid > s.budget;
}

export interface GroupRow {
  group: BudgetGroup;
  lines: BudgetLine[];
  spend: Spend;
}

// Each group with its live lines and totals, in the groups' order.
export function groupRows(groups: BudgetGroup[], lines: BudgetLine[], payments: ExpensePayment[]): GroupRow[] {
  const paid = paidByLine(payments);
  return [...groups]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((group) => {
      const mine = lines.filter((l) => l.group_id === group.id && !l.voided_at);
      return { group, lines: mine, spend: spendOf(mine, paid) };
    });
}

// Totals per team, program or event: whatever key a line carries.
export function spendBy(
  key: "team_id" | "program_id" | "event_id",
  lines: BudgetLine[],
  payments: ExpensePayment[]
): Map<string, Spend> {
  const paid = paidByLine(payments);
  const out = new Map<string, Spend>();
  for (const l of lines) {
    const id = l[key];
    if (!id || l.voided_at) continue;
    const s = out.get(id) ?? { ...NO_SPEND };
    s.budget += l.budget_cents;
    s.paid += paid.get(l.id) ?? 0;
    out.set(id, s);
  }
  return out;
}

// "Oct 2026" for a line's month.
export function monthLabel(month: string | null): string {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ─── Splitting a cost across a team ─────────────────────────────────────────

// A total in even shares, the odd cents going to the first ones, so the
// shares always add back up to the total.
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0 || totalCents <= 0) return [];
  const base = Math.floor(totalCents / n);
  const extra = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// ─── Fundraising ────────────────────────────────────────────────────────────

// Hours at the fundraiser's rate, to the cent.
export function shiftAmountCents(hours: number, rateCents: number): number {
  return Math.round(hours * rateCents);
}

// Each player's balance and their brothers and sisters (players who share a
// parent), for sending fundraising money on down a family.
export interface FamilyBalances {
  balance: Map<string, number>; // cents still owed; negative is a credit
  siblings: Map<string, string[]>; // player → the family's other players
  names: Map<string, string>;
}

export interface SpillPiece {
  player_id: string;
  amount_cents: number;
  hours: number;
}

// A fundraiser credit toward one player that, once their balance is paid,
// goes on to their brothers and sisters (by name), the way Record payment
// splits a family's payment. Anything past what the whole family owes stays
// on the player picked. Hours follow the money, to the hundredth.
export function familySpill(amountCents: number, hours: number, playerId: string, fb: FamilyBalances): SpillPiece[] {
  const sibs = (fb.siblings.get(playerId) ?? [])
    .filter((id) => id !== playerId)
    .sort((a, b) => (fb.names.get(a) ?? "").localeCompare(fb.names.get(b) ?? ""));
  const split = splitPayment(
    amountCents,
    [playerId, ...sibs].map((id) => ({ player_id: id, balance: fb.balance.get(id) ?? 0 }))
  );
  // One player takes it all: the one picked, or a brother when the one
  // picked owes nothing.
  if (split.length <= 1) return [{ player_id: split[0]?.player_id ?? playerId, amount_cents: amountCents, hours }];
  const pieces = split.map((x) => ({ player_id: x.player_id, amount_cents: x.amount_cents, hours: Math.max(0.01, Math.round((hours * x.amount_cents * 100) / amountCents) / 100) }));
  // The first piece takes up the rounding, so the hours still add up.
  const rest = pieces.slice(1).reduce((n, x) => n + x.hours, 0);
  pieces[0].hours = Math.max(0.01, Math.round((hours - rest) * 100) / 100);
  return pieces;
}

// What's owed after those credits, for the next shift in the same run.
export function applySpill(fb: FamilyBalances, pieces: SpillPiece[]): void {
  for (const p of pieces) fb.balance.set(p.player_id, (fb.balance.get(p.player_id) ?? 0) - p.amount_cents);
}

// ─── Programs ───────────────────────────────────────────────────────────────

export function levelsFrom(saved: unknown): ProgramLevel[] {
  if (!Array.isArray(saved)) return [];
  return saved
    .map((r) => r as Partial<ProgramLevel> | null)
    .filter((r): r is ProgramLevel => typeof r?.label === "string" && !!r.label.trim() && typeof r.cents === "number" && Number.isInteger(r.cents) && r.cents >= 0)
    .map((r) => ({ label: r.label.trim().slice(0, 60), cents: r.cents }));
}

// "$60", or "$60–$100" across levels.
export function priceRange(levels: ProgramLevel[]): string {
  if (levels.length === 0) return "Free";
  const cents = levels.map((l) => l.cents);
  const lo = Math.min(...cents);
  const hi = Math.max(...cents);
  const fmt = (c: number) => (c % 100 === 0 ? `$${c / 100}` : formatAmount(c));
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}

export type SignupState = "paid" | "owes" | "waived" | "on_account";

// Where a sign-up stands. A roster player's fee is on the family's account
// (paid there, with everything else); anyone else pays on the sign-up.
// A sign-up paid from Nelson's Produce earnings: its fee is a charge on the
// family's account, and their Nelson's credit pays it.
export const NELSONS_LABEL = "Nelson's Produce";
export const NELSONS_REF = "NP: Nelson's Produce";
export function coveredByNelsons(s: Pick<ProgramSignup, "charge_id" | "paid_ref">): boolean {
  return !!s.charge_id && (s.paid_ref ?? "").startsWith("NP");
}

export function signupState(s: Pick<ProgramSignup, "charge_id" | "price_cents" | "paid_cents" | "paid_method">): SignupState {
  if (s.charge_id) return "on_account";
  if (s.paid_method === "waived") return "waived";
  return s.paid_cents >= s.price_cents ? "paid" : "owes";
}

export interface ProgramTotals {
  signups: number;
  billed: number; // fees asked for: roster charges plus everyone else's price
  collected: number; // paid on the sign-up (roster fees are paid on the account)
  costs: Spend;
}

export function programTotals(
  programId: string,
  data: Pick<ClubData, "signups" | "signupCharges" | "lines" | "expensePayments">
): ProgramTotals {
  const live = data.signups.filter((s) => s.program_id === programId && !s.cancelled_at);
  const charges = new Map(data.signupCharges.map((c) => [c.id, c]));
  let billed = 0;
  let collected = 0;
  for (const s of live) {
    const charge = s.charge_id ? charges.get(s.charge_id) : null;
    if (charge) {
      if (!charge.voided_at) billed += charge.amount_cents;
    } else if (s.paid_method !== "waived") {
      billed += s.price_cents;
      collected += Math.min(s.paid_cents, s.price_cents);
    }
  }
  const costs = spendOf(
    data.lines.filter((l) => l.program_id === programId),
    paidByLine(data.expensePayments)
  );
  return { signups: live.length, billed, collected, costs };
}

// ─── The Snapshot ───────────────────────────────────────────────────────────

export interface Snapshot {
  season: string;
  moneyIn: {
    families: number; // payments from families on Payments
    programs: number; // paid on clinic and workout sign-ups
    income: number; // donations, sponsors, the tournament we host…
    fundraising: number; // earned at fundraiser shifts
    total: number;
  };
  moneyOut: number; // paid on budget lines
  net: number;
  budget: { spend: Spend; incomeExpected: number; incomeReceived: number };
  families: ClubData["families"] & { fundraisingCredits: number; coachComps: number };
  groups: { name: string; spend: Spend }[];
  teams: { name: string; spend: Spend; passedOn: number }[];
  programs: { name: string; totals: ProgramTotals }[];
  events: { name: string; spend: Spend; income: number; expected: number }[];
  funds: { name: string; total: number }[];
  fundraisers: { name: string; toFamilies: number; toFunds: number }[];
}

export function buildSnapshot(
  data: ClubData,
  credits: { fundraising: number; coachComps: number } = { fundraising: 0, coachComps: 0 }
): Snapshot {
  const liveIncome = data.income.filter((i) => !i.voided_at);
  const liveShifts = data.shifts.filter((s) => !s.voided_at);
  const paid = paidByLine(data.expensePayments);
  const liveLines = data.lines.filter((l) => !l.voided_at);
  const spendAll = spendOf(liveLines, paid);
  const programsCollected = data.programs.reduce((n, p) => n + programTotals(p.id, data).collected, 0);
  const income = liveIncome.reduce((n, i) => n + i.amount_cents, 0);
  const fundraising = liveShifts.reduce((n, s) => n + s.amount_cents, 0);
  const moneyInTotal = data.families.paid + programsCollected + income + fundraising;

  const byTeam = spendBy("team_id", data.lines, data.expensePayments);
  const passedOn = new Map<string, number>();
  const lineTeam = new Map(liveLines.map((l) => [l.id, l.team_id]));
  for (const c of data.lineCharges) {
    const team = lineTeam.get(c.line_id);
    if (team && !c.voided) passedOn.set(team, (passedOn.get(team) ?? 0) + c.amount_cents);
  }
  const byEvent = spendBy("event_id", data.lines, data.expensePayments);

  return {
    season: data.board.season,
    moneyIn: { families: data.families.paid, programs: programsCollected, income, fundraising, total: moneyInTotal },
    moneyOut: spendAll.paid,
    net: moneyInTotal - spendAll.paid,
    budget: {
      spend: spendAll,
      incomeExpected: liveIncome.reduce((n, i) => n + (i.budget_cents ?? 0), 0),
      incomeReceived: income,
    },
    families: { ...data.families, fundraisingCredits: credits.fundraising, coachComps: credits.coachComps },
    groups: groupRows(data.groups, data.lines, data.expensePayments)
      .filter((g) => g.lines.length > 0)
      .map((g) => ({ name: g.group.name, spend: g.spend })),
    teams: data.teams
      .filter((t) => byTeam.has(t.id) || passedOn.has(t.id))
      .map((t) => ({ name: t.name, spend: byTeam.get(t.id) ?? { ...NO_SPEND }, passedOn: passedOn.get(t.id) ?? 0 })),
    programs: data.programs.filter((p) => !p.archived_at).map((p) => ({ name: p.name, totals: programTotals(p.id, data) })),
    events: data.events
      .filter((e) => !e.archived_at)
      .map((e) => {
        const mine = liveIncome.filter((i) => i.event_id === e.id);
        return {
          name: e.name,
          spend: byEvent.get(e.id) ?? { ...NO_SPEND },
          income: mine.reduce((n, i) => n + i.amount_cents, 0),
          expected: mine.reduce((n, i) => n + (i.budget_cents ?? 0), 0),
        };
      }),
    funds: data.funds
      .filter((f) => !f.archived_at)
      .map((f) => ({
        name: f.name,
        total:
          liveShifts.filter((s) => s.destination === "fund" && s.fund_id === f.id).reduce((n, s) => n + s.amount_cents, 0) +
          liveIncome.filter((i) => i.fund_id === f.id).reduce((n, i) => n + i.amount_cents, 0),
      })),
    fundraisers: data.fundraisers
      .filter((f) => !f.archived_at || liveShifts.some((s) => s.fundraiser_id === f.id))
      .map((f) => {
        const mine = liveShifts.filter((s) => s.fundraiser_id === f.id);
        return {
          name: f.name,
          toFamilies: mine.filter((s) => s.destination === "family").reduce((n, s) => n + s.amount_cents, 0),
          toFunds: mine.filter((s) => s.destination === "fund").reduce((n, s) => n + s.amount_cents, 0),
        };
      }),
  };
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const dollars = (c: number) => (c / 100).toFixed(2);

// The Snapshot as a spreadsheet, for the accountant: one row per figure.
export function snapshotCsv(s: Snapshot): string {
  const rows: string[][] = [["Section", "Item", "Budget", "Actual", "Note"]];
  const add = (section: string, item: string, budget: number | null, actual: number, note = "") =>
    rows.push([section, item, budget == null ? "" : dollars(budget), dollars(actual), note]);
  add("Money in", "Families' payments", null, s.moneyIn.families);
  add("Money in", "Clinic and workout sign-ups", null, s.moneyIn.programs);
  add("Money in", "Donations, sponsors and events", s.budget.incomeExpected, s.moneyIn.income);
  add("Money in", "Fundraising", null, s.moneyIn.fundraising);
  add("Money in", "Total", null, s.moneyIn.total);
  add("Money out", "Total paid", s.budget.spend.budget, s.moneyOut);
  add("Net", "Money in minus money out", null, s.net);
  for (const g of s.groups) add("Spending by group", g.name, g.spend.budget, g.spend.paid);
  for (const t of s.teams) add("Teams", t.name, t.spend.budget, t.spend.paid, t.passedOn ? `${dollars(t.passedOn)} passed on to families` : "");
  for (const p of s.programs)
    add("Programs", p.name, p.totals.costs.budget, p.totals.costs.paid, `${p.totals.signups} signed up; ${dollars(p.totals.billed)} in fees`);
  for (const e of s.events) {
    add("Events", `${e.name}: costs`, e.spend.budget, e.spend.paid);
    add("Events", `${e.name}: income`, e.expected, e.income);
  }
  for (const f of s.funds) add("Funds", f.name, null, f.total);
  for (const f of s.fundraisers) add("Fundraising", f.name, null, f.toFamilies + f.toFunds, `${dollars(f.toFamilies)} to families' fees`);
  add("Families", "Charged", null, s.families.charged);
  add("Families", "Taken off", null, s.families.credited, `Includes ${dollars(s.families.fundraisingCredits)} fundraising and ${dollars(s.families.coachComps)} coaches' kids`);
  add("Families", "Paid", null, s.families.paid);
  add("Families", "Still owed", null, s.families.owed, `${s.families.owing} families`);
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ─── Input clean-up ─────────────────────────────────────────────────────────

export interface LineInput {
  id?: string;
  group_id: string;
  team_id: string;
  program_id: string;
  event_id: string;
  vendor: string;
  description: string;
  month: string; // "2026-10" or ""
  budget: string; // "$2,300" or ""
  note: string;
}

export interface CleanLine {
  group_id: string;
  team_id: string | null;
  program_id: string | null;
  event_id: string | null;
  vendor: string | null;
  description: string;
  month: string | null;
  budget_cents: number;
  note: string | null;
}

export function cleanLineInput(input: LineInput): CleanLine | { error: string } {
  if (!input.group_id) return { error: "Pick a group." };
  const description = clean(input.description, 120);
  if (!description) return { error: "Say what it's for, like Gym rent or Regionals hotel." };
  let budget_cents = 0;
  if (input.budget.trim()) {
    const c = parseAmount(input.budget);
    if (c == null) return { error: "Enter the budget as an amount, like 2300." };
    budget_cents = c;
  }
  let month: string | null = null;
  if (input.month.trim()) {
    if (!/^\d{4}-\d{2}$/.test(input.month.trim())) return { error: "Pick a month." };
    month = `${input.month.trim()}-01`;
  }
  return {
    group_id: input.group_id,
    team_id: input.team_id || null,
    program_id: input.program_id || null,
    event_id: input.event_id || null,
    vendor: clean(input.vendor, 80),
    description,
    month,
    budget_cents,
    note: clean(input.note, 500),
  };
}

export interface MoneyInput {
  amount: string;
  date: string;
  method: string;
  reference: string;
  note: string;
}

export interface CleanMoney {
  amount_cents: number;
  date: string;
  method: ExpenseMethod;
  reference: string | null;
  note: string | null;
}

export function cleanMoneyInput(input: MoneyInput): CleanMoney | { error: string } {
  const amount_cents = parseAmount(input.amount);
  if (amount_cents == null || amount_cents <= 0) return { error: "Enter an amount, like 530 or 71.74." };
  if (!ISO_DAY.test(input.date)) return { error: "Pick the date." };
  if (!EXPENSE_METHODS.some((m) => m.key === input.method)) return { error: "Pick how it was paid." };
  return {
    amount_cents,
    date: input.date,
    method: input.method as ExpenseMethod,
    reference: clean(input.reference, 80),
    note: clean(input.note, 500),
  };
}

export interface IncomeInput {
  id?: string;
  category: string;
  description: string;
  from_name: string;
  amount: string; // received; "" while only expected
  budget: string; // expected; optional
  received_on: string;
  method: string;
  reference: string;
  program_id: string;
  event_id: string;
  fund_id: string;
  note: string;
}

export interface CleanIncome {
  category: IncomeCategory;
  description: string;
  from_name: string | null;
  amount_cents: number;
  budget_cents: number | null;
  received_on: string | null;
  method: ExpenseMethod | null;
  reference: string | null;
  program_id: string | null;
  event_id: string | null;
  fund_id: string | null;
  note: string | null;
}

export function incomeLabel(category: string): string {
  return INCOME_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

export function cleanIncomeInput(input: IncomeInput): CleanIncome | { error: string } {
  if (!INCOME_CATEGORIES.some((c) => c.key === input.category)) return { error: "Pick what kind of money it is." };
  const from_name = clean(input.from_name, 120);
  const description = clean(input.description, 120) ?? (from_name ? `${incomeLabel(input.category)}: ${from_name}` : incomeLabel(input.category));
  let amount_cents = 0;
  if (input.amount.trim()) {
    const c = parseAmount(input.amount);
    if (c == null) return { error: "Enter what came in as an amount, like 2000." };
    amount_cents = c;
  }
  let budget_cents: number | null = null;
  if (input.budget.trim()) {
    const c = parseAmount(input.budget);
    if (c == null) return { error: "Enter what you expect as an amount, like 4000." };
    budget_cents = c;
  }
  if (amount_cents <= 0 && !budget_cents) return { error: "Enter what came in, or what you expect." };
  let received_on: string | null = null;
  let method: ExpenseMethod | null = null;
  if (amount_cents > 0) {
    if (!ISO_DAY.test(input.received_on)) return { error: "Pick the date it came in." };
    received_on = input.received_on;
    if (input.method) {
      if (!EXPENSE_METHODS.some((m) => m.key === input.method)) return { error: "Pick how it came in." };
      method = input.method as ExpenseMethod;
    }
  }
  return {
    category: input.category as IncomeCategory,
    description,
    from_name,
    amount_cents,
    budget_cents,
    received_on,
    method,
    reference: amount_cents > 0 ? clean(input.reference, 80) : null,
    program_id: input.program_id || null,
    event_id: input.event_id || null,
    fund_id: input.fund_id || null,
    note: clean(input.note, 500),
  };
}

export interface ProgramInput {
  id?: string;
  name: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  schedule: string;
  location: string;
  description: string;
  levels: { label: string; amount: string }[];
  capacity: string;
}

export interface CleanProgram {
  name: string;
  kind: ProgramKind;
  starts_on: string | null;
  ends_on: string | null;
  schedule: string | null;
  location: string | null;
  description: string | null;
  levels: ProgramLevel[];
  capacity: number | null;
}

export function cleanProgramInput(input: ProgramInput): CleanProgram | { error: string } {
  const name = clean(input.name, 80);
  if (!name) return { error: "Give it a name, like Summer Clinics 2027." };
  if (!PROGRAM_KINDS.some((k) => k.key === input.kind)) return { error: "Pick what kind it is." };
  for (const d of [input.starts_on, input.ends_on]) if (d && !ISO_DAY.test(d)) return { error: "Check the dates." };
  if (input.starts_on && input.ends_on && input.ends_on < input.starts_on) return { error: "The last day is before the first." };
  const levels: ProgramLevel[] = [];
  for (const l of input.levels) {
    const label = l.label.trim();
    if (!label && !l.amount.trim()) continue;
    const cents = parseAmount(l.amount);
    if (cents == null) return { error: `Enter a price for ${label || "each level"}, like 60.` };
    levels.push({ label: (label || "Everyone").slice(0, 60), cents });
  }
  if (levels.length === 0) return { error: "Add a price, like Everyone $60." };
  let capacity: number | null = null;
  if (input.capacity.trim()) {
    capacity = Number(input.capacity.trim());
    if (!Number.isInteger(capacity) || capacity <= 0) return { error: "Room for should be a whole number." };
  }
  return {
    name,
    kind: input.kind as ProgramKind,
    starts_on: input.starts_on || null,
    ends_on: input.ends_on || null,
    schedule: clean(input.schedule, 300),
    location: clean(input.location, 200),
    description: clean(input.description, 2000),
    levels,
    capacity,
  };
}

export interface ShiftInput {
  fundraiser_id: string;
  event_label: string;
  worked_on: string;
  worker_name: string;
  hours: string;
  amount: string; // blank: hours × the fundraiser's rate
  destination: string;
  player_id: string;
  fund_id: string;
  note: string;
}

export interface CleanShift {
  fundraiser_id: string;
  event_label: string | null;
  worked_on: string | null;
  worker_name: string;
  hours: number;
  amount_cents: number;
  destination: ShiftDestination;
  player_id: string | null;
  fund_id: string | null;
  note: string | null;
}

export function cleanShiftInput(input: ShiftInput, rateCents: number): CleanShift | { error: string } {
  if (!input.fundraiser_id) return { error: "Pick the fundraiser." };
  const worker_name = clean(input.worker_name, 120);
  if (!worker_name) return { error: "Who worked the shift?" };
  const hours = Number(input.hours.trim());
  if (!Number.isFinite(hours) || hours <= 0 || hours > 200) return { error: "Enter the hours, like 4 or 3.5." };
  let amount_cents = shiftAmountCents(hours, rateCents);
  if (input.amount.trim()) {
    const c = parseAmount(input.amount);
    if (c == null || c <= 0) return { error: "Enter the amount earned, like 40." };
    amount_cents = c;
  }
  if (amount_cents <= 0) return { error: rateCents > 0 ? "This shift earned nothing. Check the rate in Settings → Fees." : "Enter what it raised in Earned." };
  if (input.worked_on && !ISO_DAY.test(input.worked_on)) return { error: "Check the date." };
  if (input.destination === "family") {
    if (!input.player_id) return { error: "Pick the player whose fees it goes toward." };
  } else if (input.destination === "fund") {
    if (!input.fund_id) return { error: "Pick the fund." };
  } else return { error: "Pick where the money goes." };
  return {
    fundraiser_id: input.fundraiser_id,
    event_label: clean(input.event_label, 80),
    worked_on: input.worked_on || null,
    worker_name,
    hours: Math.round(hours * 100) / 100,
    amount_cents,
    destination: input.destination,
    player_id: input.destination === "family" ? input.player_id : null,
    fund_id: input.destination === "fund" ? input.fund_id : null,
    note: clean(input.note, 500),
  };
}

// The last place a worker sent their money, so the next shift starts there.
export function lastChoiceFor(
  worker: string,
  shifts: { worker_name: string; destination: ShiftDestination; player_id: string | null; fund_id: string | null; created_at: string; voided_at: string | null }[]
): { destination: ShiftDestination; player_id: string | null; fund_id: string | null } | null {
  const key = worker.trim().toLowerCase();
  if (!key) return null;
  const mine = shifts
    .filter((s) => !s.voided_at && s.worker_name.trim().toLowerCase() === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return mine[0] ? { destination: mine[0].destination, player_id: mine[0].player_id, fund_id: mine[0].fund_id } : null;
}
