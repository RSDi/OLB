// Matching the club Gmail's Venmo export to players' fees, for
// scripts/import-venmo-payments.ts. Pure, so the rules can be tested.
//
// A Venmo is applied only when we can tell whose it is AND the amount is
// what those players owe:
//   - whose: the note names a player ("Max Malone 26-27 season"), or the
//     payer is a parent on file, or the payer's last name is one only one
//     family on the board has. The whole family is then in play; players the
//     note names narrow it down.
//   - amount: it equals what the players owe now (charges − credits −
//     payments, where they have charges), or, for players with nothing
//     charged or paid yet, their registration fee. One player's amount or
//     several players' added together both count, so one Venmo for two kids
//     splits across them.
// Anything else is an exception for the Treasurer to look at.

import { groupFamilies, lastName, parseAmount, totalsFor } from "./logic.ts"; // explicit extension so node --test can load this file
import { REFERENCE_MAX, type Charge, type Payment } from "./types.ts";

export interface VenmoRow {
  row: number; // spreadsheet row, for the exceptions sheet
  type: string; // received, paid, transfer_to_bank, notification, …
  from: string | null; // who paid
  amount: string | null; // "$525.00"
  about: string | null; // the Venmo note
  date: string | null; // "2026-10-05 08:36 AM CT"
  messageId: string | null; // Gmail message id: what makes a row unique
}

export interface MatchPlayer {
  id: string;
  full_name: string;
  team: string | null;
  fee_cents: number | null;
  parent_ids: string[];
  parent_names: string[];
}

export interface PlannedPayment {
  row: VenmoRow;
  paid_on: string;
  amount_cents: number;
  reference: string;
  note: string;
  splits: { player_id: string; amount_cents: number }[];
  how: string; // why it matched, for the preview
}

export interface VenmoException {
  row: VenmoRow;
  paid_on: string | null;
  amount_cents: number | null;
  reason: string;
  candidates: string; // players it might be, with what they owe
}

export interface MatchResult {
  applied: PlannedPayment[];
  exceptions: VenmoException[];
  alreadyImported: VenmoRow[];
  notPayments: VenmoRow[];
}

// "Venmo 1a10c47f1fb38582": stored as the payment's reference, so a re-run
// knows which Venmos are already in.
export function venmoReference(messageId: string): string {
  return `Venmo ${messageId}`.slice(0, REFERENCE_MAX);
}

// "2026-10-05 08:36 AM CT" → "2026-10-05". The export's dates are already
// Central time.
export function venmoDate(raw: string | null): string | null {
  const m = (raw ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// Lowercase words, no accents or punctuation: "O'Brien-Smith" → "obrien smith".
export function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasWords(haystack: string, needle: string): boolean {
  return !!needle && ` ${haystack} `.includes(` ${needle} `);
}

function firstName(fullName: string): string {
  return normName(fullName).split(" ")[0] ?? "";
}

// Players the note names: their full name, or their first name alongside
// their last name ("Goeller boys … Micah") or the payer's last name.
function namedInNote(players: MatchPlayer[], note: string, payerLast: string): MatchPlayer[] {
  return players.filter((p) => {
    const full = normName(p.full_name);
    if (hasWords(note, full)) return true;
    const first = firstName(p.full_name);
    const last = normName(lastName(p.full_name));
    return first.length > 2 && hasWords(note, first) && (hasWords(note, last) || last === payerLast);
  });
}

// Every way to pick players whose amounts add up to the payment. Families are
// small, so trying every subset is fine.
function subsetsSumming(items: { id: string; cents: number }[], target: number): { id: string; cents: number }[][] {
  const out: { id: string; cents: number }[][] = [];
  const n = Math.min(items.length, 12);
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const pick: { id: string; cents: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += items[i].cents;
        pick.push(items[i]);
      }
    }
    if (sum === target) out.push(pick);
  }
  return out;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function matchVenmo(
  rows: VenmoRow[],
  players: MatchPlayer[],
  charges: Pick<Charge, "player_id" | "kind" | "amount_cents" | "voided_at">[],
  existingPayments: Pick<Payment, "player_id" | "amount_cents" | "paid_on" | "reference" | "voided_at">[],
  opts: { since?: string | null } = {}
): MatchResult {
  const result: MatchResult = { applied: [], exceptions: [], alreadyImported: [], notPayments: [] };
  const families = groupFamilies(players);
  const familyOf = new Map<string, MatchPlayer[]>();
  for (const f of families) for (const p of f) familyOf.set(p.id, f);

  const imported = new Set(existingPayments.filter((p) => !p.voided_at).map((p) => p.reference ?? ""));
  // Payments as this run goes: earlier Venmos count against later ones.
  const payments = existingPayments.map((p) => ({ ...p }));
  const charged = new Set(charges.filter((c) => !c.voided_at).map((c) => c.player_id));

  // What a player owes now: their balance once anything is charged, else
  // their registration fee less anything already paid.
  const owed = (p: MatchPlayer): number | null => {
    const t = totalsFor([p.id], charges, payments);
    if (charged.has(p.id)) return t.balance;
    return p.fee_cents == null ? null : p.fee_cents - t.paid;
  };
  const describe = (ps: MatchPlayer[]) =>
    ps
      .map((p) => {
        const o = owed(p);
        return `${p.full_name}${p.team ? ` (${p.team})` : ""}: ${o == null ? "no fee on file" : o > 0 ? `owes ${dollars(o)}` : "paid up"}`;
      })
      .join("; ");

  const sorted = [...rows].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  for (const row of sorted) {
    if (row.type !== "received") {
      result.notPayments.push(row);
      continue;
    }
    const paid_on = venmoDate(row.date);
    const amount_cents = parseAmount(row.amount ?? "");
    const fail = (reason: string, candidates: MatchPlayer[] = []) =>
      result.exceptions.push({ row, paid_on, amount_cents, reason, candidates: describe(candidates) });

    if (row.messageId && imported.has(venmoReference(row.messageId))) {
      result.alreadyImported.push(row);
      continue;
    }
    if (!row.messageId) {
      fail("No Gmail message id, so it can't be told apart from other Venmos");
      continue;
    }
    if (!paid_on || amount_cents == null || amount_cents <= 0) {
      fail("Couldn't read the date or amount");
      continue;
    }
    if (opts.since && paid_on < opts.since) {
      fail(`Before ${opts.since}, when this season's registrations started`);
      continue;
    }

    // Whose is it?
    const payer = normName(row.from);
    const payerLast = normName(lastName(row.from ?? ""));
    const note = normName(row.about);
    const named = namedInNote(players, note, payerLast);
    let family: MatchPlayer[] = [];
    let how = "";
    const namedFamilies = new Set(named.map((p) => familyOf.get(p.id)));
    if (named.length > 0 && namedFamilies.size === 1) {
      family = familyOf.get(named[0].id)!;
      how = "player named in the note";
    } else if (named.length > 0) {
      fail("The note names players from more than one family", named);
      continue;
    } else {
      const byParent = families.filter((f) => f.some((p) => p.parent_names.some((n) => normName(n) === payer)));
      const byLast = families.filter((f) => f.some((p) => normName(lastName(p.full_name)) === payerLast));
      if (byParent.length === 1) {
        family = byParent[0];
        how = "paid by a parent on file";
      } else if (byParent.length > 1) {
        fail("The payer is a parent in more than one family", byParent.flat());
        continue;
      } else if (byLast.length === 1 && payerLast) {
        family = byLast[0];
        how = "payer's last name";
      } else if (byLast.length > 1) {
        fail("No player named, and more than one family has the payer's last name", byLast.flat());
        continue;
      } else {
        fail("No player or parent on file matches the payer or the note");
        continue;
      }
    }

    // Does the amount match?
    const scope = named.length > 0 ? named : family;
    const owing = scope
      .map((p) => ({ id: p.id, cents: owed(p) }))
      .filter((o): o is { id: string; cents: number } => o.cents != null && o.cents > 0);
    const picks = subsetsSumming(owing, amount_cents);
    if (picks.length !== 1) {
      fail(
        picks.length > 1
          ? "The amount matches more than one player; pick who it's for"
          : owing.length === 0
            ? "Nothing owing on file for this family (already recorded by hand?)"
            : "The amount doesn't match what the family owes",
        family
      );
      continue;
    }

    const splits = picks[0].map((s) => ({ player_id: s.id, amount_cents: s.cents }));
    for (const s of splits) {
      payments.push({ player_id: s.player_id, amount_cents: s.amount_cents, paid_on, reference: null, voided_at: null });
    }
    const about = row.about?.trim();
    result.applied.push({
      row,
      paid_on,
      amount_cents,
      reference: venmoReference(row.messageId),
      note: `Venmo from ${row.from ?? "unknown"}${about ? `: "${about}"` : ""}`.slice(0, 500),
      splits,
      how,
    });
  }
  return result;
}
