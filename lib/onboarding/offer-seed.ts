// What an offer link fills in on /player-registration. Plain module, pure,
// safe for client and server. loadOfferSeed (offers.ts) is the server lookup;
// this is the shape and the row → seed mapping, so tests can check it.

import { splitName } from "../teams/registration-form.ts"; // explicit extension so node --test can load this file
import { shortDay } from "./dates.ts";

export interface OfferSeedData {
  token: string;
  first: string;
  last: string;
  dob: string | null;
  email: string | null;
  expires: string;
  parentFirst: string;
  parentLast: string;
  parentName: string | null;
  phone: string | null;
  // Waitlist/assessment answer. Context only — never pre-checks homeschool_affirm.
  homeschooled: boolean | null;
  // Waitlist notes. Staff already see these on the waitlist card (extra.intake).
  // Not copied onto the public form (not even commitments_note).
  notes: string | null;
}

export interface OfferRegRow {
  first_name: string;
  last_name: string;
  dob: string | null;
  parent_email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  extra: { intake?: { homeschooled?: unknown; notes?: unknown } } | null;
}

// The Omaha day an offer runs out (YYYY-MM-DD).
export function expiryDay(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function offerSeedFromRow(token: string, expiresAt: string, reg: OfferRegRow): OfferSeedData {
  const [parentFirst, parentLast] = splitName(reg.parent_name);
  const intake = reg.extra?.intake;
  const homeschooled = typeof intake?.homeschooled === "boolean" ? intake.homeschooled : null;
  const notes = typeof intake?.notes === "string" && intake.notes.trim() ? intake.notes.trim() : null;
  return {
    token,
    first: reg.first_name,
    last: reg.last_name,
    dob: reg.dob,
    email: reg.parent_email,
    expires: shortDay(expiryDay(expiresAt)),
    parentFirst,
    parentLast,
    parentName: reg.parent_name?.trim() || null,
    phone: reg.parent_phone,
    homeschooled,
    notes,
  };
}
