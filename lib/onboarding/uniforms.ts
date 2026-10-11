// Sarah's Uniforms page (0130): sizes counted by item, the vendor order
// sheet, and the charges to add when the order goes in. Plain module, pure,
// safe for client and server.

import type { UniformItem, UniformWho } from "./form-extras.ts"; // explicit extension so node --test can load this file

export const WHO_LABEL: Record<UniformWho, string> = {
  all: "Everyone who needs a uniform",
  hs: "High school (grays)",
  optional: "Optional",
};

export const DEFAULT_SIZES = ["YS", "YM", "YL", "YXL", "AS", "AM", "AL", "AXL", "A2XL"];

// A size line typed in Settings ("YS, YM, YL") as a clean list.
export function parseSizes(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
}

export interface SizeRow {
  id: string;
  item_id: string;
  size: string;
  player: string;
  team: string | null;
  confirmed: boolean;
  charged: boolean;
}

export interface CountTable {
  sizes: string[]; // the columns, in the order the items list them
  rows: { item: UniformItem; counts: Record<string, number>; total: number }[];
}

// How many of each size of each item.
export function countSizes(items: UniformItem[], rows: SizeRow[]): CountTable {
  const sizes: string[] = [];
  for (const i of items) for (const s of i.sizes) if (!sizes.includes(s)) sizes.push(s);
  return {
    sizes,
    rows: items.map((item) => {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        if (r.item_id !== item.id) continue;
        counts[r.size] = (counts[r.size] ?? 0) + 1;
        total++;
      }
      return { item, counts, total };
    }),
  };
}

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

// The order sheet: one line per player per item, for the vendor.
export function orderCsv(items: UniformItem[], rows: SizeRow[]): string {
  const name = new Map(items.map((i) => [i.id, i.name]));
  const lines = [["Item", "Size", "Player", "Team", "Confirmed at try-on"].join(",")];
  const sorted = [...rows].sort(
    (a, b) =>
      items.findIndex((i) => i.id === a.item_id) - items.findIndex((i) => i.id === b.item_id) ||
      a.size.localeCompare(b.size) ||
      a.player.localeCompare(b.player)
  );
  for (const r of sorted) lines.push([name.get(r.item_id) ?? "", r.size, r.player, r.team ?? "", r.confirmed ? "Yes" : ""].map(cell).join(","));
  return lines.join("\n") + "\n";
}

export interface ChargePlanRow {
  size_id: string;
  player_id: string;
  description: string;
  amount_cents: number;
}

// The uniform charges to add: each sized item with a price, on a player
// who's on the roster, not charged yet.
export function chargePlan(
  items: UniformItem[],
  sizes: { id: string; item_id: string; size: string; player_id: string | null; charge_id: string | null }[]
): { charges: ChargePlanRow[]; noPrice: string[]; notOnRoster: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  const charges: ChargePlanRow[] = [];
  const noPrice = new Set<string>();
  let notOnRoster = 0;
  for (const s of sizes) {
    if (s.charge_id) continue;
    const item = byId.get(s.item_id);
    if (!item) continue;
    if (item.price_cents == null) {
      noPrice.add(item.name);
      continue;
    }
    if (!s.player_id) {
      notOnRoster++;
      continue;
    }
    if (item.price_cents === 0) continue;
    charges.push({ size_id: s.id, player_id: s.player_id, description: `${item.name} (${s.size})`.slice(0, 120), amount_cents: item.price_cents });
  }
  return { charges, noPrice: [...noPrice], notOnRoster };
}
