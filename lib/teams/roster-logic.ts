// The roster rules the Directory's registration review and player editing
// share: which player on the roster a registration is, and what an edit to a
// player may hold. Plain module (no "use server"), safe for client and server,
// and pure, so tests can run it.

import { AGE_GROUPS } from "./volunteer-options.ts"; // explicit extension so node --test can load this file

// The public form's answers, as createRegistration saves them in
// olb_registrations.extra.
export type RegistrationExtra = {
  first_season?: boolean | null;
  address?: { line1?: string; line2?: string; city?: string; state?: string; zip?: string };
  athlete_phone?: string | null;
  athlete_email?: string | null;
  homeschool_affirm?: boolean | null;
  directory_optin?: boolean;
  needs_uniform?: boolean | null;
  needs_grays?: boolean | null;
  father?: RegistrationParentAnswers;
  mother?: RegistrationParentAnswers;
  waiver_agreed?: boolean;
  printed_name?: string | null;
  signature_name?: string | null;
  signature_date?: string | null;
  fee_tier?: string;
  donation_interest?: boolean;
  payment_option?: string;
  // The email whose code the family typed back before sending (0103).
  email_confirmed?: string | null;
  // Moved off the roster back to the waitlist: where they were
  // (lib/teams/waitlist-player.ts).
  from_roster?: {
    team: string | null;
    age_group: string | null;
    jersey_number: string | null;
    shirt_size: string | null;
    moved_at: string;
  };
};

export type RegistrationParentAnswers = {
  first?: string;
  last?: string;
  email?: string;
  phone?: string;
  volunteer?: string[];
  volunteer_other?: string;
};

// The registration's player as the roster names them: "First Last".
export function registrationFullName(first: string, last: string): string {
  return `${first.trim()} ${last.trim()}`;
}

// Which of the players already on the board with the registration's name it
// is: the one born the same day, else one of them with no birthday on record
// (or any, when the registration has none). Null means a new player. Approve
// (applyRegistration) and the review page's hint both use this, so the hint
// says what Approve will do.
export function pickExistingPlayer<T extends { dob: string | null }>(sameName: T[], dob: string | null): T | null {
  return sameName.find((p) => dob && p.dob === dob) ?? sameName.find((p) => !dob || !p.dob) ?? null;
}

export type RosterMatch<T> =
  // Approve updates this player instead of adding another.
  | { kind: "same"; player: T }
  // Same name, different birthday: Approve adds a second player.
  | { kind: "other"; player: T };

export function matchRoster<T extends { full_name: string; dob: string | null }>(
  reg: { first_name: string; last_name: string; dob: string | null },
  roster: T[],
): RosterMatch<T> | null {
  const name = registrationFullName(reg.first_name, reg.last_name).toLowerCase();
  const sameName = roster.filter((p) => p.full_name.trim().toLowerCase() === name);
  const same = pickExistingPlayer(sameName, reg.dob);
  if (same) return { kind: "same", player: same };
  return sameName.length > 0 ? { kind: "other", player: sameName[0] } : null;
}

// ─── Editing a player ───────────────────────────────────────────────────────

export interface PlayerEdit {
  full_name: string;
  dob: string | null;
  jersey_number: string | null;
  age_group: string | null;
}

// What Edit player saves, tidied, or what's wrong with it.
export function cleanPlayerEdit(input: PlayerEdit): { value: PlayerEdit } | { error: string } {
  const full_name = input.full_name.trim().replace(/\s+/g, " ");
  if (!full_name) return { error: "Enter the player's name." };
  if (full_name.length > 120) return { error: "That name is too long." };

  const dob = input.dob?.trim() || null;
  if (dob) {
    const d = new Date(`${dob}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob) {
      return { error: "Enter the birthday as a date." };
    }
  }

  // Text, so "0" and "00" stay different numbers.
  const jersey_number = input.jersey_number?.trim() || null;
  if (jersey_number && !/^\d{1,3}$/.test(jersey_number)) return { error: "A jersey number is 1 to 3 digits." };

  // 10U–18U, or an older value like "8U" already on the player.
  const age_group = input.age_group?.trim().toUpperCase() || null;
  if (age_group && !AGE_GROUPS.includes(age_group) && !/^\d{1,2}U$/.test(age_group)) {
    return { error: "Pick an age group from the list." };
  }

  return { value: { full_name, dob, jersey_number, age_group } };
}
