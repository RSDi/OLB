// The public registration form's answers, shared by the step-by-step wizard,
// the full form and the server: one family (address, parents, waiver,
// payment) registering one or more players. Each player becomes its own
// olb_registrations row. Plain module (no "use server"), safe for client and
// server, and pure, so tests can run it.

import { ageFromDob } from "./age.ts"; // explicit extension so node --test can load this file

// The season the form registers for, and the board it lands on.
export const REGISTRATION_SEASON = "2026-2027";
export const SEASON_LABEL = "2026-27";
// Fee tiers go by the player's age on this day.
export const AGE_CUTOFF = "2026-08-01";
export const AGE_CUTOFF_LABEL = "August 1, 2026";

export const FEE_TIERS = ["8u-12u - $375.00", "14u - $400.00", "16u-18u - $525.00"];
export const PAYMENT_OPTIONS = ["Venmo", "Check"];
export const MAX_PLAYERS = 6;

export type SignatureMode = "draw" | "type";

// What the form knows about one player.
export interface KidAnswers {
  key: string;
  athlete_first: string;
  athlete_last: string;
  athlete_dob: string;
  first_season: boolean | null;
  athlete_phone: string;
  athlete_email: string;
  homeschool_affirm: boolean | null;
  needs_uniform: boolean | null;
  needs_grays: boolean | null;
  fee_tier: string;
}

// What the form knows about the family, the same for every player on it.
export interface FamilyAnswers {
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  directory_optin: boolean;
  father_first: string;
  father_last: string;
  father_email: string;
  father_phone: string;
  father_volunteer: string[];
  father_volunteer_other: string;
  mother_first: string;
  mother_last: string;
  mother_email: string;
  mother_phone: string;
  mother_volunteer: string[];
  mother_volunteer_other: string;
  waiver_agreed: boolean;
  printed_name: string;
  signature_mode: SignatureMode;
  signature_name: string;
  signature_image: string;
  donation_interest: boolean | null;
  payment_option: string;
}

export interface RegistrationState {
  kids: KidAnswers[];
  family: FamilyAnswers;
}

// One player's registration, as createRegistrations saves it.
export type RegistrationInput = Omit<KidAnswers, "key" | "athlete_dob"> &
  Omit<FamilyAnswers, "donation_interest"> & {
    athlete_dob: string | null;
    donation_interest: boolean;
    signature_date: string;
  };

let keySeq = 0;
export function newKid(patch: Partial<KidAnswers> = {}): KidAnswers {
  return {
    key: `kid-${++keySeq}`,
    athlete_first: "",
    athlete_last: "",
    athlete_dob: "",
    first_season: null,
    athlete_phone: "",
    athlete_email: "",
    homeschool_affirm: null,
    needs_uniform: null,
    needs_grays: null,
    fee_tier: "",
    ...patch,
  };
}

export const EMPTY_FAMILY: FamilyAnswers = {
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  zip: "",
  directory_optin: true,
  father_first: "",
  father_last: "",
  father_email: "",
  father_phone: "",
  father_volunteer: [],
  father_volunteer_other: "",
  mother_first: "",
  mother_last: "",
  mother_email: "",
  mother_phone: "",
  mother_volunteer: [],
  mother_volunteer_other: "",
  waiver_agreed: false,
  printed_name: "",
  signature_mode: "draw",
  signature_name: "",
  signature_image: "",
  donation_interest: null,
  payment_option: "",
};

export function emptyRegistration(): RegistrationState {
  return { kids: [newKid()], family: { ...EMPTY_FAMILY } };
}

// ─── Fees ───────────────────────────────────────────────────────────────────

export function ageOnCutoff(dob: string | null | undefined): number | null {
  return dob ? ageFromDob(dob, new Date(`${AGE_CUTOFF}T00:00:00`)) : null;
}

// The tier a birthday puts a player in: 12 and under, 13–14, 15 and up.
export function suggestedTier(dob: string | null | undefined): string | null {
  const age = ageOnCutoff(dob);
  if (age == null) return null;
  return age <= 12 ? FEE_TIERS[0] : age <= 14 ? FEE_TIERS[1] : FEE_TIERS[2];
}

// "8u-12u - $375.00" → { label: "8u–12u", dollars: 375 }.
export function tierParts(tier: string): { label: string; dollars: number } | null {
  const m = tier.match(/^(.+?)\s*-\s*\$([\d,.]+)/);
  if (!m) return null;
  return { label: m[1].replace("-", "–"), dollars: Number(m[2].replace(/,/g, "")) };
}

// High school (16u–18u) players are also asked about the gray alternate uniform.
export function isHighSchoolTier(tier: string): boolean {
  return tier.startsWith("16u");
}

// ─── Words ──────────────────────────────────────────────────────────────────

export function kidFirst(k: KidAnswers): string {
  return k.athlete_first.trim() || "your player";
}

// "Sam", "Sam and Evan", "Sam, Evan and Leo".
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function kidsNames(kids: KidAnswers[]): string {
  return joinNames(kids.map(kidFirst));
}

// "Mary Ann Smith" → ["Mary Ann", "Smith"].
export function splitName(full: string | null | undefined): [string, string] {
  const words = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["", ""];
  if (words.length === 1) return [words[0], ""];
  return [words.slice(0, -1).join(" "), words[words.length - 1]];
}

// A parent's saved answer ("Coach/ Assistant Coach, Fundraising, Snacks")
// back into the form's checkboxes and its "Other" box.
export function splitInterests(saved: string | null | undefined, options: string[]): { picked: string[]; other: string } {
  let rest = (saved ?? "").trim();
  const picked: string[] = [];
  for (const o of options) {
    if (rest.includes(o)) {
      picked.push(o);
      rest = rest.replace(o, "");
    }
  }
  const other = rest
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  return { picked, other };
}

// ─── Checking and sending ───────────────────────────────────────────────────

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
export function looksLikeEmail(s: string): boolean {
  return EMAIL.test(s.trim());
}

export function kidProblem(k: KidAnswers, many: boolean): string | null {
  const who = many ? `${kidFirst(k)}: ` : "";
  if (!k.athlete_first.trim() || !k.athlete_last.trim()) return `${many ? "Each player" : "The player"} needs a first and last name.`;
  if (!k.athlete_dob) return `${who}please add a birthday.`;
  if (k.homeschool_affirm === null) return `${who}please answer the homeschool eligibility question.`;
  if (k.needs_uniform === null) return `${who}please say whether they need a new black and white uniform.`;
  if (!k.fee_tier) return `${who}please pick a registration fee.`;
  return null;
}

export function familyProblem(f: FamilyAnswers): string | null {
  if (!f.address_line1.trim() || !f.city.trim() || !f.state || !f.zip.trim()) return "Please add your full address.";
  if (!f.waiver_agreed) return "Please check the box agreeing to the Accident Waiver.";
  if (!f.printed_name.trim()) return "Please enter the parent or guardian's printed name for the waiver.";
  const signed = f.signature_mode === "draw" ? !!f.signature_image : !!f.signature_name.trim();
  if (!signed) return "Please sign the Accident Waiver: draw your signature or type your full name.";
  if (!f.payment_option) return "Please choose how you'll pay.";
  return null;
}

// The first thing still missing before the registration can be sent.
export function registrationProblem(s: RegistrationState): string | null {
  if (s.kids.length === 0) return "Add a player to register.";
  for (const k of s.kids) {
    const p = kidProblem(k, s.kids.length > 1);
    if (p) return p;
  }
  return familyProblem(s.family);
}

// One row per player for createRegistrations.
export function toInputs(s: RegistrationState, today: string): RegistrationInput[] {
  return s.kids.map((k) => ({
    ...s.family,
    athlete_first: k.athlete_first,
    athlete_last: k.athlete_last,
    athlete_dob: k.athlete_dob || null,
    first_season: k.first_season,
    athlete_phone: k.athlete_phone,
    athlete_email: k.athlete_email,
    homeschool_affirm: k.homeschool_affirm,
    needs_uniform: k.needs_uniform,
    needs_grays: k.needs_grays,
    fee_tier: k.fee_tier,
    donation_interest: s.family.donation_interest === true,
    signature_date: today,
  }));
}

// ─── Returning families ─────────────────────────────────────────────────────

export interface PrefillParent {
  first: string;
  last: string;
  email: string;
  phone: string;
  volunteer: string[];
  volunteer_other: string;
}

export interface PrefillPlayer {
  key: string;
  first: string;
  last: string;
  dob: string;
  phone: string;
  email: string;
  // On this season's board already (registered through Cognito or this form).
  registeredThisSeason: boolean;
  directoryOptin: boolean;
  address: { line1: string; line2: string; city: string; state: string; zip: string };
  father: PrefillParent | null;
  mother: PrefillParent | null;
}

// What we found for a checked email: the family's players, newest season
// first, and who the email belongs to.
export interface FamilyPrefill {
  firstName: string | null;
  relationship: "father" | "mother" | "player" | null;
  players: PrefillPlayer[];
}

// A registration filled in from the players picked, plus any brothers and
// sisters being added. The family's details come from the first player picked.
export function fromPrefill(prefill: FamilyPrefill, picked: string[], added: KidAnswers[]): RegistrationState {
  const players = prefill.players.filter((p) => picked.includes(p.key));
  const kids = players.map((p) =>
    newKid({
      key: p.key,
      athlete_first: p.first,
      athlete_last: p.last,
      athlete_dob: p.dob,
      first_season: false,
      athlete_phone: p.phone,
      athlete_email: p.email,
      fee_tier: suggestedTier(p.dob) ?? "",
    })
  );
  const base = players[0] ?? prefill.players[0];
  const parent = (p: PrefillParent | null | undefined) => ({
    first: p?.first ?? "",
    last: p?.last ?? "",
    email: p?.email ?? "",
    phone: p?.phone ?? "",
    volunteer: p?.volunteer ?? [],
    other: p?.volunteer_other ?? "",
  });
  const dad = parent(base?.father);
  const mom = parent(base?.mother);
  return {
    kids: [...kids, ...added.map((k) => ({ ...k, fee_tier: k.fee_tier || suggestedTier(k.athlete_dob) || "" }))],
    family: {
      ...EMPTY_FAMILY,
      address_line1: base?.address.line1 ?? "",
      address_line2: base?.address.line2 ?? "",
      city: base?.address.city ?? "",
      state: base?.address.state ?? "",
      zip: base?.address.zip ?? "",
      directory_optin: base?.directoryOptin ?? true,
      father_first: dad.first,
      father_last: dad.last,
      father_email: dad.email,
      father_phone: dad.phone,
      father_volunteer: dad.volunteer,
      father_volunteer_other: dad.other,
      mother_first: mom.first,
      mother_last: mom.last,
      mother_email: mom.email,
      mother_phone: mom.phone,
      mother_volunteer: mom.volunteer,
      mother_volunteer_other: mom.other,
    },
  };
}
