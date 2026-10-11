// What the registration form asks on top of today's questions while the
// registration workflow is on (0130): the handbook signatures and each
// player's uniform sizes. With the workflow off the page gets no extras and
// the form is exactly as before. Plain module, pure, safe for client and
// server, so tests can run it.

import { isHighSchoolTier, kidFirst, type KidAnswers } from "../teams/registration-form.ts"; // explicit extension so node --test can load this file

export type UniformWho = "all" | "hs" | "optional";

export interface UniformItem {
  id: string;
  name: string;
  who: UniformWho;
  price_cents: number | null;
  sizes: string[];
}

// What the page passes the form when the workflow is on.
export interface FormExtras {
  handbookUrl: string | null;
  items: UniformItem[];
  tryOn: string | null;
}

// The extra answers, per player and per family. Sizes are by item id; an
// optional item left out (or "") means "No thanks".
export interface KidExtras {
  handbook_player_name: string;
  sizes: Record<string, string>;
}

export interface FamilyExtras {
  handbook_agreed: boolean;
  handbook_parent_name: string;
}

export interface ExtrasState {
  kids: Record<string, KidExtras>; // by KidAnswers.key
  family: FamilyExtras;
}

export function emptyExtras(): ExtrasState {
  return { kids: {}, family: { handbook_agreed: false, handbook_parent_name: "" } };
}

export function kidExtras(state: ExtrasState, key: string): KidExtras {
  return state.kids[key] ?? { handbook_player_name: "", sizes: {} };
}

// The items a player gets sized for: the uniform if they need one, grays if
// they're high school and need them, and every optional item.
export function itemsFor(kid: Pick<KidAnswers, "needs_uniform" | "needs_grays" | "fee_tier">, items: UniformItem[]): UniformItem[] {
  return items.filter((i) =>
    i.who === "all" ? kid.needs_uniform === true : i.who === "hs" ? isHighSchoolTier(kid.fee_tier) && kid.needs_grays === true : true
  );
}

// Whether the sizes step has anything to ask.
export function needsSizesStep(kids: KidAnswers[], items: UniformItem[]): boolean {
  return kids.some((k) => itemsFor(k, items).length > 0);
}

// The first thing still missing in the extras, or null.
export function extrasProblem(kids: KidAnswers[], extras: ExtrasState, config: FormExtras | null): string | null {
  if (!config) return null;
  const many = kids.length > 1;
  for (const k of kids) {
    const x = kidExtras(extras, k.key);
    for (const item of itemsFor(k, config.items)) {
      if (item.who === "optional") continue;
      const size = x.sizes[item.id];
      if (!size || !item.sizes.includes(size)) return `${many ? `${kidFirst(k)}: p` : "P"}lease pick a ${item.name.toLowerCase()} size.`;
    }
  }
  if (config.handbookUrl) {
    for (const k of kids) {
      if (!kidExtras(extras, k.key).handbook_player_name.trim()) {
        return `${kidFirst(k)} needs to sign the handbook: type ${kids.length > 1 ? "each player's" : "their"} name.`;
      }
    }
    if (!extras.family.handbook_parent_name.trim()) return "A parent needs to sign the handbook: type your name.";
    if (!extras.family.handbook_agreed) return "Please check the box saying you've read the handbook together.";
  }
  return null;
}

// One player's extras as the server saves them (on RegistrationInput).
export interface InputExtras {
  sizes: Record<string, string>;
  handbook: { agreed: boolean; player_name: string; parent_name: string } | null;
}

export function inputExtras(kid: KidAnswers, extras: ExtrasState, config: FormExtras | null): InputExtras | undefined {
  if (!config) return undefined;
  const x = kidExtras(extras, kid.key);
  const allowed = new Set(itemsFor(kid, config.items).map((i) => i.id));
  const sizes = Object.fromEntries(Object.entries(x.sizes).filter(([id, size]) => allowed.has(id) && !!size));
  return {
    sizes,
    handbook: config.handbookUrl
      ? { agreed: extras.family.handbook_agreed, player_name: x.handbook_player_name.trim(), parent_name: extras.family.handbook_parent_name.trim() }
      : null,
  };
}

// The server's check of what came in, against the season's items. Sizes for
// items that don't apply are dropped; a size not on the item's list is an
// error.
export function cleanInputExtras(
  kid: Pick<KidAnswers, "needs_uniform" | "needs_grays" | "fee_tier">,
  extras: InputExtras | undefined,
  config: FormExtras
): { sizes: Record<string, string>; handbook: InputExtras["handbook"] } | { error: string } {
  const sizes: Record<string, string> = {};
  for (const item of itemsFor(kid, config.items)) {
    const size = extras?.sizes?.[item.id];
    if (!size) {
      if (item.who === "optional") continue;
      return { error: `Please pick a ${item.name.toLowerCase()} size.` };
    }
    if (!item.sizes.includes(size)) return { error: `That ${item.name.toLowerCase()} size isn't one we order.` };
    sizes[item.id] = size;
  }
  let handbook: InputExtras["handbook"] = null;
  if (config.handbookUrl) {
    const h = extras?.handbook;
    if (!h?.agreed || !h.player_name?.trim() || !h.parent_name?.trim()) return { error: "Please sign the handbook." };
    handbook = { agreed: true, player_name: h.player_name.trim().slice(0, 120), parent_name: h.parent_name.trim().slice(0, 120) };
  }
  return { sizes, handbook };
}

export function formatPrice(cents: number | null): string {
  if (cents == null) return "";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
