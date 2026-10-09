// Moving a player from the roster back to the waitlist: the registration they
// go back to. A player who came in from the registration form already has
// one (approved), which goes back to waitlisted. A player from the
// spreadsheet import has none, so one is written from what the roster knows,
// in the shape the form saves (olb_registrations.extra), so Approve can put
// them back on the roster the same way as anyone else.

import type { RegistrationExtra, RegistrationParentAnswers } from "./roster-logic";
import { teamLabel } from "./volunteer-options.ts"; // explicit extension so node --test can load this file

export interface RosterPlayerFull {
  id: string;
  board_id: string;
  full_name: string;
  dob: string | null;
  age_group: string | null;
  new_to_program: boolean | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  registration_fee: string | null;
  payment_method: string | null;
  shirt_size: string | null;
  waiver_signed: boolean | null;
  waiver_signed_on: string | null;
  directory_optin: boolean | null;
  jersey_number: string | null;
  registered_at: string | null;
  team: { name: string; age_group: string | null } | null;
  parents: {
    relationship: "father" | "mother" | "guardian";
    member: { full_name: string | null; email: string | null; phone: string | null; volunteer_interests: string | null } | null;
  }[];
}

// Where they were when they came off the roster, kept on the registration.
export type FromRoster = NonNullable<RegistrationExtra["from_roster"]>;

export function fromRoster(p: RosterPlayerFull, now: string): FromRoster {
  return {
    team: p.team ? teamLabel(p.team) : null,
    age_group: p.age_group,
    jersey_number: p.jersey_number,
    shirt_size: p.shirt_size,
    moved_at: now,
  };
}

// "Mary Ann Smith" → Mary / Ann Smith. Approve joins them back with a space,
// so the name round-trips exactly.
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] ?? "", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// The form has a father and a mother; a guardian fills whichever is free.
function parentSlots(p: RosterPlayerFull): { father?: RegistrationParentAnswers; mother?: RegistrationParentAnswers } {
  const slots: { father?: RosterPlayerFull["parents"][number]; mother?: RosterPlayerFull["parents"][number] } = {
    father: p.parents.find((pa) => pa.relationship === "father"),
    mother: p.parents.find((pa) => pa.relationship === "mother"),
  };
  for (const g of p.parents.filter((pa) => pa.relationship === "guardian")) {
    if (!slots.father) slots.father = g;
    else if (!slots.mother) slots.mother = g;
  }
  return { father: answers(slots.father?.member), mother: answers(slots.mother?.member) };
}

function answers(m: RosterPlayerFull["parents"][number]["member"] | undefined): RegistrationParentAnswers | undefined {
  if (!m?.full_name?.trim()) return undefined;
  const name = splitName(m.full_name);
  return {
    first: name.first,
    last: name.last,
    email: m.email ?? "",
    phone: m.phone ?? "",
    volunteer: [],
    volunteer_other: m.volunteer_interests ?? "",
  };
}

// The new registration for a player with none, waitlisted.
export function registrationFromPlayer(p: RosterPlayerFull, note: string | null, userId: string, now: string) {
  const name = splitName(p.full_name);
  const { father, mother } = parentSlots(p);
  const firstParent = father ?? mother;
  const extra: RegistrationExtra = {
    first_season: p.new_to_program ?? null,
    address: {
      line1: p.address_line1 ?? "",
      line2: p.address_line2 ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      zip: p.postal_code ?? "",
    },
    athlete_phone: p.phone,
    athlete_email: p.email,
    directory_optin: p.directory_optin !== false,
    father,
    mother,
    waiver_agreed: p.waiver_signed === true,
    signature_date: p.waiver_signed_on,
    fee_tier: p.registration_fee ?? undefined,
    payment_option: p.payment_method ?? undefined,
    from_roster: fromRoster(p, now),
  };
  return {
    board_id: p.board_id,
    first_name: name.first,
    last_name: name.last,
    dob: p.dob,
    parent_name: firstParent ? [firstParent.first, firstParent.last].filter(Boolean).join(" ") : null,
    parent_email: father?.email || mother?.email || null,
    parent_phone: father?.phone || mother?.phone || null,
    status: "waitlisted",
    notes: note,
    extra,
    reviewed_by: userId,
    reviewed_at: now,
    // Keeps their place in line: the waitlist reads in the order they registered.
    created_at: p.registered_at ?? now,
  };
}
