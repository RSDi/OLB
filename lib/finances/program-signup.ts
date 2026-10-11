// The public clinic and workout sign-up form (0131). Plain module, pure,
// safe for client and server, and loadable by node --test.

import { looksLikeEmail } from "../teams/registration-form.ts"; // explicit extension so node --test can load this file
import type { ProgramLevel } from "./club-types.ts";

export const MAX_SIGNUP_KIDS = 6;

export interface SignupKid {
  key: string;
  first: string;
  last: string;
  dob: string;
  level: string; // a level's label; "" when the program has one price
}

export interface SignupInput {
  parent_name: string;
  email: string;
  phone: string;
  note: string;
  kids: SignupKid[];
}

export function newSignupKid(key: string): SignupKid {
  return { key, first: "", last: "", dob: "", level: "" };
}

export function signupProblem(s: SignupInput, levels: ProgramLevel[]): string | null {
  if (s.kids.length === 0) return "Add at least one player.";
  if (s.kids.length > MAX_SIGNUP_KIDS) return `Up to ${MAX_SIGNUP_KIDS} players at a time.`;
  for (const k of s.kids) {
    if (!k.first.trim() || !k.last.trim()) return "Please add each player's first and last name.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k.dob)) return `Please add ${k.first.trim() || "each player"}'s birthday.`;
    if (levels.length > 1 && !levels.some((l) => l.label === k.level)) return `Please pick a group for ${k.first.trim()}.`;
  }
  if (!s.parent_name.trim()) return "Please add your name.";
  if (!looksLikeEmail(s.email)) return "Please add an email we can reach you at.";
  return null;
}

// The price for a player: their level's, or the one price.
export function priceFor(levels: ProgramLevel[], level: string): { label: string | null; cents: number } {
  if (levels.length === 1) return { label: levels[0].label, cents: levels[0].cents };
  const l = levels.find((x) => x.label === level);
  return l ? { label: l.label, cents: l.cents } : { label: null, cents: 0 };
}

// "Sam Carter" for matching a sign-up to the season's roster: case and
// spacing don't matter.
export function nameKey(first: string, last: string): string {
  return `${first} ${last}`.trim().toLowerCase().replace(/\s+/g, " ");
}
