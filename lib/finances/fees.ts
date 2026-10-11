// The season's registration fee tiers (0131): Settings → Fees, or the
// built-in ones when nothing's saved. Pure, safe for client and server, and
// loadable by node --test.
//
// A tier is shown and stored on a registration as text ("8u-12u - $375.00"),
// which is what registrationFeeCents() reads the amount back out of, so a
// tier changed mid-season never changes a fee already asked for.

import { formatAmount, parseAmount } from "../requirements/logic.ts"; // explicit extension so node --test can load this file

export interface FeeTier {
  label: string; // "8u-12u"
  max_age: number | null; // this age and under, on the age cutoff; null = and up
  cents: number;
}

export const DEFAULT_FEE_TIERS: FeeTier[] = [
  { label: "8u-12u", max_age: 12, cents: 37500 },
  { label: "14u", max_age: 14, cents: 40000 },
  { label: "16u-18u", max_age: null, cents: 52500 },
];

// "8u-12u - $375.00", as the form has always written it.
export function tierText(t: FeeTier): string {
  return `${t.label} - ${formatAmount(t.cents)}`;
}

// What Settings saved, checked, sorted by age with the "and up" tier last;
// the built-in tiers when there's nothing usable.
export function feeTiersFrom(saved: unknown): FeeTier[] {
  if (!Array.isArray(saved)) return DEFAULT_FEE_TIERS;
  const tiers: FeeTier[] = [];
  for (const raw of saved) {
    const r = raw as Partial<FeeTier> | null;
    const label = typeof r?.label === "string" ? r.label.trim() : "";
    const cents = typeof r?.cents === "number" && Number.isInteger(r.cents) && r.cents >= 0 ? r.cents : null;
    const max = r?.max_age == null ? null : Number.isInteger(r.max_age) ? (r.max_age as number) : NaN;
    if (!label || cents == null || Number.isNaN(max)) continue;
    tiers.push({ label: label.slice(0, 40), max_age: max, cents });
  }
  if (tiers.length === 0) return DEFAULT_FEE_TIERS;
  return tiers.sort((a, b) => (a.max_age ?? Infinity) - (b.max_age ?? Infinity));
}

// The tier for a player this age: the first whose max age covers them, else
// the last ("and up").
export function tierForAge(age: number | null, tiers: FeeTier[] = DEFAULT_FEE_TIERS): FeeTier | null {
  if (age == null || tiers.length === 0) return null;
  return tiers.find((t) => t.max_age != null && age <= t.max_age) ?? tiers[tiers.length - 1];
}

export interface TierInput {
  label: string;
  max_age: string; // "" for "and up"
  amount: string; // "$375"
}

// Settings → Fees rows, cleaned for saving. Exactly one "and up" tier, last.
export function cleanTiers(rows: TierInput[]): FeeTier[] | { error: string } {
  const out: FeeTier[] = [];
  for (const r of rows) {
    const label = r.label.trim();
    if (!label && !r.amount.trim() && !r.max_age.trim()) continue;
    if (!label || label.length > 40) return { error: "Give each tier a name, like 8u-12u." };
    const cents = parseAmount(r.amount);
    if (cents == null || cents < 0) return { error: `Enter a fee for ${label}, like 375.` };
    const ageText = r.max_age.trim();
    const max_age = ageText ? Number(ageText) : null;
    if (max_age != null && (!Number.isInteger(max_age) || max_age < 4 || max_age > 25)) {
      return { error: `The age for ${label} should be a whole number, like 12.` };
    }
    out.push({ label, max_age, cents });
  }
  if (out.length === 0) return { error: "Add at least one tier." };
  if (out.filter((t) => t.max_age == null).length !== 1) return { error: "Leave the age blank on exactly one tier: the oldest players." };
  const sorted = [...out].sort((a, b) => (a.max_age ?? Infinity) - (b.max_age ?? Infinity));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].max_age != null && sorted[i].max_age === sorted[i - 1].max_age) return { error: "Two tiers have the same age." };
  }
  return sorted;
}
