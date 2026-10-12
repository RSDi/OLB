// Reading the Treasurer's season spreadsheet ("2627 Omaha Lightning.xlsx")
// into club finances (0131): Payables → budget lines and what was paid,
// Receivables → income, the workouts and clinics sheets → programs and
// sign-ups, Nelson's Produce → fundraiser shifts, Fundraising → donations,
// and Regular Season → a check against what Payments says. Pure (it works
// on cell grids), so tests can run it; lib/finances/import-actions.ts reads
// the file and writes the result.

import type { IncomeCategory, ProgramKind, ProgramLevel } from "./club-types.ts";

export type Cell = string | number | boolean | Date | null | undefined;
export interface SheetGrid {
  name: string;
  rows: Cell[][];
}

export interface SheetPayment {
  amount_cents: number;
  method: "check" | "other";
  reference: string | null;
  paid_on: string | null;
}

export interface SheetLine {
  row: number;
  group: string;
  team: string | null;
  event: string | null;
  program: string | null;
  vendor: string | null;
  description: string;
  month: string | null; // YYYY-MM-01
  budget_cents: number;
  payment: SheetPayment | null;
}

export interface SheetIncome {
  row: number;
  category: IncomeCategory;
  from_name: string | null;
  description: string;
  amount_cents: number;
  budget_cents: number | null;
  program: string | null;
  event: string | null;
  note: string | null;
}

export interface SheetSignup {
  first: string;
  last: string;
  level: string;
  price_cents: number;
  // NP: no payment needed (covered by their Nelson's Produce earnings).
  waived: boolean;
}

export interface SheetProgram {
  name: string;
  kind: ProgramKind;
  levels: ProgramLevel[];
  signups: SheetSignup[];
}

export interface SheetShift {
  row: number;
  event_label: string | null;
  worker_name: string;
  hours: number;
  amount_cents: number;
  destination: "family" | "fund";
}

export interface SheetPlayer {
  row: number;
  first: string;
  last: string;
  dob: string | null;
  // "CK": a coach's kid, comped.
  comped: boolean;
  fee_cents: number | null;
  paid_cents: number | null;
  nelsons_cents: number | null;
}

export interface SheetPlan {
  lines: SheetLine[];
  income: SheetIncome[];
  programs: SheetProgram[];
  shifts: SheetShift[];
  players: SheetPlayer[];
  // What was read but left out on purpose, and why.
  notes: string[];
}

// ─── Cells ──────────────────────────────────────────────────────────────────

export function text(v: Cell): string {
  if (v == null) return "";
  if (v instanceof Date) return isoDate(v) ?? "";
  return String(v).replace(/\s+/g, " ").trim();
}

export function money(v: Cell): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === "string") {
    const s = v.replace(/[$,\s]/g, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 100);
  }
  return null;
}

function isoDate(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateOf(v: Cell): string | null {
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// "October" → "2026-10-01" in a season starting 2026; January–March are the
// next year. "Feburary/March" (sic) → February.
export function monthOf(label: string, seasonStart: number): string | null {
  const s = label.toLowerCase().replace("feburary", "february");
  const i = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(s));
  if (i < 0) return null;
  const year = i + 1 >= 4 ? seasonStart : seasonStart + 1;
  return `${year}-${String(i + 1).padStart(2, "0")}-01`;
}

// "Caleb Van Schooneveld" → ["Caleb", "Van Schooneveld"].
export function splitName(full: string): { first: string; last: string } {
  const words = text(full).split(" ").filter(Boolean);
  if (words.length <= 1) return { first: words[0] ?? "", last: "" };
  return { first: words[0], last: words.slice(1).join(" ") };
}

const isTotal = (...cells: Cell[]) => cells.some((c) => /^(total|=sum)/i.test(text(c)));
const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

// ─── Payables ───────────────────────────────────────────────────────────────

function readPayables(rows: Cell[][], seasonStart: number, notes: string[]): SheetLine[] {
  const out: SheetLine[] = [];
  let a = "";
  let b = "";
  for (let i = 1; i < rows.length; i++) {
    const [A, B, C, D, E, F] = rows[i] ?? [];
    if (isTotal(A, B, C)) continue;
    if (text(A)) {
      a = text(A);
      b = text(B);
    } else if (text(B)) b = text(B);
    const item = text(C);
    const budget = money(D) ?? 0;
    const paid = money(E) ?? 0;
    if (!budget && !paid) continue;

    let payment: SheetPayment | null = null;
    if (paid > 0) {
      const ref = text(F).match(/^ck\s*#?\s*(\d+)/i);
      payment = { amount_cents: paid, method: ref ? "check" : "other", reference: ref ? ref[1] : null, paid_on: dateOf(F) };
    }
    const base = { row: i + 1, team: null, event: null, program: null, vendor: null, month: null, budget_cents: budget, payment };
    const al = a.toLowerCase();
    if (!a && /cognito/i.test(b)) {
      out.push({ ...base, group: "Subscriptions", vendor: "Cognito", description: "Cognito forms", month: monthOf(item, seasonStart) });
    } else if (!a && !b) {
      out.push({ ...base, group: "General", description: item || "Expense" });
    } else if ((al === "spring" || al === "summer") && /krave/i.test(b)) {
      out.push({ ...base, group: "Programs", program: `${title(a)} Workouts`, vendor: "Krave", description: item || `${title(a)} workouts at Krave` });
    } else if (/clinic/i.test(b) || /clinic/i.test(a)) {
      out.push({ ...base, group: "Programs", program: "Summer Clinics", description: item || b });
    } else if (/gym|rental/i.test(a)) {
      const month = monthOf(item, seasonStart);
      out.push({ ...base, group: "Practice gyms", vendor: b || null, description: month ? "Gym rent" : item || "Gym rent", month });
    } else if (/^teams?$/i.test(a)) {
      out.push({ ...base, group: "Teams", team: b || null, description: item || "Team cost" });
    } else if (/^mrs$/i.test(a)) {
      out.push({ ...base, group: "Events", event: "MRS", description: item || "MRS" });
    } else {
      out.push({ ...base, group: "General", description: [b, item].filter(Boolean).join(" – ") || a });
    }
  }
  if (out.length === 0) notes.push("Payables: nothing with a budget or a payment.");
  return out;
}

// ─── Receivables ────────────────────────────────────────────────────────────

function readReceivables(rows: Cell[][], notes: string[]): SheetIncome[] {
  const out: SheetIncome[] = [];
  let a = "";
  for (let i = 1; i < rows.length; i++) {
    const [A, B, C, D, , F] = rows[i] ?? [];
    if (isTotal(A, B, C, D)) continue;
    if (text(A)) a = text(A);
    const who = text(B);
    const budget = money(C);
    const got = money(D) ?? 0;
    const np = money(F);
    if (!who || (!budget && !got)) continue;
    const row = i + 1;
    const base = { row, from_name: who, program: null, event: null, note: null, budget_cents: budget };
    if (/^spring$/i.test(a) || /^summer$/i.test(a) || /krave|summer registration/i.test(who)) {
      notes.push(`Receivables row ${row} (${who}): the sign-ups come in from the workouts and clinics sheets instead, so it isn't added twice.`);
    } else if (/fall|winter|season registration/i.test(a + who)) {
      notes.push(`Receivables row ${row} (${who}): families' registration payments are on Payments already, so it isn't added here.`);
    } else if (/t-?shirt/i.test(a)) {
      out.push({
        ...base,
        category: "merch",
        description: "Summer clinic T-shirt",
        program: "Summer Clinics",
        amount_cents: np ? 0 : got,
        budget_cents: np ? np || got : null,
        note: np ? "NP: no payment needed (Nelson's Produce)" : null,
      });
    } else if (/donation/i.test(a)) {
      out.push({ ...base, category: "donation", description: `Donation: ${who}`, amount_cents: got, budget_cents: budget });
    } else if (/credit/i.test(a)) {
      out.push({ ...base, category: "vendor_credit", description: `Credit: ${who}`, amount_cents: got, budget_cents: budget });
    } else if (/^mrs$/i.test(a)) {
      out.push({ ...base, from_name: null, category: "event", event: "MRS", description: `MRS ${who.toLowerCase()}`, amount_cents: got, budget_cents: budget });
    } else if (/warm/i.test(a)) {
      out.push({ ...base, category: "merch", description: "Warm-up shirt", amount_cents: got, budget_cents: budget });
    } else {
      out.push({ ...base, category: "other", description: [a, who].filter(Boolean).join(": "), amount_cents: got, budget_cents: budget });
    }
  }
  return out;
}

// ─── Workouts and clinics ───────────────────────────────────────────────────

function levelsOf(signups: SheetSignup[]): ProgramLevel[] {
  const seen = new Map<string, Map<number, number>>();
  for (const s of signups) {
    const counts = seen.get(s.level) ?? new Map<number, number>();
    counts.set(s.price_cents, (counts.get(s.price_cents) ?? 0) + 1);
    seen.set(s.level, counts);
  }
  // Each level at its most common price.
  return [...seen].map(([label, counts]) => ({ label, cents: [...counts].sort((x, y) => y[1] - x[1])[0][0] }));
}

function readWorkouts(rows: Cell[][]): SheetProgram[] {
  const programs = new Map<string, SheetSignup[]>();
  let season = "Spring";
  let level: string | null = null;
  for (const r of rows) {
    const [A, B, C] = r ?? [];
    if (isTotal(A, B, C)) continue;
    const b = text(B);
    if (/^(spring|summer|fall|winter)$/i.test(b) && money(C) == null) {
      season = title(b);
      level = null;
      continue;
    }
    if (/junior/i.test(text(A))) level = "Junior high";
    else if (/high school/i.test(text(A))) level = "High school";
    const price = money(C);
    if (!b || price == null) continue;
    const { first, last } = splitName(b);
    const list = programs.get(season) ?? [];
    list.push({ first, last, level: level ?? (price >= 10000 ? "High school" : "Junior high"), price_cents: price, waived: false });
    programs.set(season, list);
  }
  return [...programs].map(([s, signups]) => ({ name: `${s} Workouts`, kind: "workout" as const, levels: levelsOf(signups), signups }));
}

function readClinics(rows: Cell[][]): SheetProgram | null {
  const signups: SheetSignup[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [A, B, C, , E] = rows[i] ?? [];
    if (isTotal(A, B, C)) continue;
    const name = text(A);
    if (!name) continue;
    const np = money(E);
    const price = money(C) ?? money(B) ?? np ?? 0;
    const { first, last } = splitName(name);
    signups.push({ first, last, level: "Everyone", price_cents: price, waived: !!np });
  }
  return signups.length ? { name: "Summer Clinics", kind: "clinic", levels: levelsOf(signups), signups } : null;
}

// ─── Fundraising ────────────────────────────────────────────────────────────

function readNelsons(rows: Cell[][]): SheetShift[] {
  const out: SheetShift[] = [];
  let label: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const [A, B, C, D, , F] = rows[i] ?? [];
    if (isTotal(A, B, C, D)) continue;
    if (text(A)) label = text(A);
    const worker = text(B);
    const hours = typeof C === "number" ? C : Number(text(C));
    const amount = money(D);
    if (!worker || !amount || !(hours > 0)) continue;
    out.push({ row: i + 1, event_label: label, worker_name: worker, hours: Math.round(hours * 100) / 100, amount_cents: amount, destination: /bucket/i.test(text(F)) ? "fund" : "family" });
  }
  return out;
}

function readDonations(rows: Cell[][], already: SheetIncome[]): SheetIncome[] {
  const out: SheetIncome[] = [];
  for (let i = 0; i < rows.length; i++) {
    const [A, B] = rows[i] ?? [];
    const who = text(A);
    const amount = money(B);
    if (!who || !amount || isTotal(A, B)) continue;
    // Also on Receivables (Lanphier's $2,000): once is enough.
    if (already.some((x) => x.category === "donation" && x.from_name?.toLowerCase() === who.toLowerCase() && x.amount_cents === amount)) continue;
    out.push({ row: i + 1, category: "donation", from_name: who, description: `Donation: ${who}`, amount_cents: amount, budget_cents: null, program: null, event: null, note: null });
  }
  return out;
}

// ─── The roster ─────────────────────────────────────────────────────────────

function readRoster(rows: Cell[][]): SheetPlayer[] {
  const head = (rows[0] ?? []).map((c) => text(c).toLowerCase());
  const col = (re: RegExp, fallback: number) => {
    const i = head.findIndex((h) => re.test(h));
    return i >= 0 ? i : fallback;
  };
  const [cFirst, cLast, cDob, cFee, cPaid, cNel] = [col(/^first/, 0), col(/^last/, 1), col(/^dob|birth/, 2), col(/registration amount|^fee/, 7), col(/^paid/, 9), col(/nelson/, 11)];
  const out: SheetPlayer[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const first = text(r[cFirst]);
    const last = text(r[cLast]);
    if (!first || !last) continue;
    const fee = text(r[cFee]);
    out.push({
      row: i + 1,
      first,
      last,
      dob: dateOf(r[cDob]),
      comped: /^ck$/i.test(fee),
      fee_cents: money(r[cFee]),
      paid_cents: money(r[cPaid]),
      nelsons_cents: money(r[cNel]),
    });
  }
  return out;
}

// ─── The whole workbook ─────────────────────────────────────────────────────

const find = (sheets: SheetGrid[], re: RegExp) => sheets.find((s) => re.test(s.name));

export function parseFinanceWorkbook(sheets: SheetGrid[], seasonStart: number): SheetPlan {
  const notes: string[] = [];
  const payables = find(sheets, /payable/i);
  const receivables = find(sheets, /receivable/i);
  const workouts = find(sheets, /workout/i);
  const clinics = find(sheets, /clinic/i);
  const nelsons = find(sheets, /nelson|produce/i);
  const fundraising = find(sheets, /^fundrais/i);
  const roster = find(sheets, /regular season|roster/i);
  for (const [sheet, label] of [
    [payables, "Payables"],
    [receivables, "Receivables"],
  ] as const) {
    if (!sheet) notes.push(`No ${label} sheet in this file.`);
  }
  const income = receivables ? readReceivables(receivables.rows, notes) : [];
  const programs = [...(workouts ? readWorkouts(workouts.rows) : [])];
  const clinic = clinics ? readClinics(clinics.rows) : null;
  if (clinic) programs.push(clinic);
  return {
    lines: payables ? readPayables(payables.rows, seasonStart, notes) : [],
    income: [...income, ...(fundraising ? readDonations(fundraising.rows, income) : [])],
    programs,
    shifts: nelsons ? readNelsons(nelsons.rows) : [],
    players: roster ? readRoster(roster.rows) : [],
    notes,
  };
}

// ─── The import's two steps (lib/finances/import-actions.ts) ─────────────────

// On everything the import adds, so it can be found and taken back.
export const IMPORT_NOTE = "Imported from the spreadsheet";

export interface ImportChoices {
  // Sheet team name → team id ("" leaves the cost off any team).
  teams: Record<string, string>;
  // Nelson's worker name → a player id, "fund" (Buckets for Bucks) or "skip".
  workers: Record<string, string>;
  // Put Nelson's "Registration" shifts on families' accounts as credits.
  postCredits: boolean;
  // Once a player's fees are paid, the rest of a shift goes on to their
  // brothers and sisters.
  spill?: boolean;
}

export interface ImportPreview {
  file: string;
  season: string;
  alreadyImported: boolean;
  counts: {
    lines: number;
    budget: number;
    paid: number;
    groups: { name: string; lines: number }[];
    income: number;
    incomeIn: number;
    programs: { name: string; signups: number; onRoster: number }[];
    shifts: number;
    toFamilies: number;
    toFund: number;
  };
  // Asked of the Treasurer before importing.
  teams: { name: string; match: string | null }[];
  workers: { name: string; shifts: number; cents: number; match: string | null }[];
  players: { id: string; name: string }[];
  siteTeams: { id: string; name: string }[];
  // Regular Season against Payments: where they differ.
  checks: string[];
  notes: string[];
}

// "10u Grey" and "10U GREY" are the same team; so are "14u White" and
// "14U - White".
export function teamKey(name: string): string {
  return name.toLowerCase().replace(/gray/g, "grey").replace(/[^a-z0-9]+/g, "");
}

export function personKey(name: string): string {
  return text(name).toLowerCase();
}
