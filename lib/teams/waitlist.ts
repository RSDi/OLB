// The registration waitlist's rules (0115): who a registration's emails go
// to (the rest of emailing families is in ./family-mail), the waitlist
// message, and the spreadsheet. Plain module (no "use server"), safe for client
// and server, and pure, so tests can run it.

import type { RegistrationExtra } from "./roster-logic.ts"; // explicit extension so node --test can load this file
import {
  ALL_RECIPIENTS,
  cleanEmail as clean,
  contactEmails,
  groupByFamily,
  personName,
  type Contact,
  type FamilyGroup,
  type MailTarget,
  type Recipient,
  withPrimary,
} from "./family-mail.ts";

export { ALL_RECIPIENTS, fillMessage, firstNames, mailtoHref, messageHtml } from "./family-mail.ts";
export type { Contact, Recipient } from "./family-mail.ts";

export interface WaitlistRegistration {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  created_at: string;
  parent_email?: string | null;
  extra: RegistrationExtra;
}

// The people on a registration who have an email. A parent with no email of
// their own falls back to the one on the row (the first parent email the form
// had), so an older registration still reaches a parent. A player sharing a
// parent's email isn't listed separately (withPrimary).
export function familyContacts(r: WaitlistRegistration): Contact[] {
  const out: Contact[] = [];
  const father = clean(r.extra.father?.email);
  const mother = clean(r.extra.mother?.email);
  if (father) out.push({ role: "father", name: personName(r.extra.father) || "Dad", email: father });
  if (mother) out.push({ role: "mother", name: personName(r.extra.mother) || "Mom", email: mother });
  if (!father && !mother) {
    const row = clean(r.parent_email);
    if (row) out.push({ role: "mother", name: "Parent", email: row });
  }
  const player = clean(r.extra.athlete_email);
  if (player) out.push({ role: "player", name: `${r.first_name} ${r.last_name}`.trim(), email: player });
  return withPrimary(out);
}

// A registration as someone to email, for the message window.
export function waitlistTarget(r: WaitlistRegistration): MailTarget {
  return { id: r.id, first_name: r.first_name, name: `${r.first_name} ${r.last_name}`.trim(), contacts: familyContacts(r) };
}

// Every email on a registration for the people picked, once each.
export function familyEmails(r: WaitlistRegistration, roles: Recipient[] = ALL_RECIPIENTS): string[] {
  return contactEmails(familyContacts(r), roles);
}

// Brothers and sisters share parents, so they get one email between them.
export function groupFamilies<T extends WaitlistRegistration>(
  regs: T[],
  roles: Recipient[] = ALL_RECIPIENTS
): { groups: FamilyGroup<T>[]; noEmail: T[] } {
  return groupByFamily(regs, familyContacts, roles);
}

export const DEFAULT_SUBJECT = "Your Omaha Lightning registration";
export const DEFAULT_MESSAGE = `Hi,

Thanks for registering {player} with Omaha Lightning Basketball. Our teams are full right now, so we've added {player} to our waitlist for the 2026-27 season. We'll be in touch as soon as a spot opens.

Questions? Just reply to this email.

Omaha Lightning Basketball`;

// Every email on the list once (parents and players), for pasting into Bcc.
export function allEmails(regs: WaitlistRegistration[]): string[] {
  return [...new Set(regs.flatMap((r) => familyEmails(r)))];
}

export interface WaitlistRow extends WaitlistRegistration {
  notes: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  contacted_at: string | null;
  contacted_by_name: string | null;
}

const csvCell = (v: string | null | undefined) => {
  const s = (v ?? "").replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// The waitlist as a spreadsheet (CSV), oldest registration first.
export function waitlistCsv(rows: WaitlistRow[]): string {
  const head = [
    "Player", "Birthday", "Fee", "Registered", "Waitlisted", "Waitlisted by", "Note", "Contacted", "Contacted by",
    "Father", "Father email", "Father phone", "Mother", "Mother email", "Mother phone", "Player email", "Player phone", "Address",
  ];
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const lines = rows.map((r) => {
    const x = r.extra;
    const a = x.address ?? {};
    const address = [a.line1, a.line2, a.city, [a.state, a.zip].filter(Boolean).join(" ")].map((s) => s?.trim()).filter(Boolean).join(", ");
    return [
      `${r.first_name} ${r.last_name}`.trim(), r.dob ?? "", x.fee_tier ?? "", day(r.created_at), day(r.reviewed_at), r.reviewed_by_name,
      r.notes, day(r.contacted_at), r.contacted_by_name,
      personName(x.father), x.father?.email?.trim(), x.father?.phone?.trim(),
      personName(x.mother), x.mother?.email?.trim(), x.mother?.phone?.trim(), x.athlete_email?.trim(), x.athlete_phone?.trim(), address,
    ].map(csvCell).join(",");
  });
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
