// The registration waitlist's rules (0115): who a registration's emails go
// to, one email per family when several players share parents, the message
// text, and the spreadsheet. Plain module (no "use server"), safe for client
// and server, and pure, so tests can run it.

import type { RegistrationExtra } from "./roster-logic.ts"; // explicit extension so node --test can load this file

export interface WaitlistRegistration {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  created_at: string;
  parent_email?: string | null;
  extra: RegistrationExtra;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const clean = (e: string | null | undefined) => {
  const v = e?.trim().toLowerCase();
  return v && EMAIL.test(v) ? v : null;
};

// Who a message can go to: Dad, Mom and the player, each with their own email.
export type Recipient = "father" | "mother" | "player";
export const ALL_RECIPIENTS: Recipient[] = ["father", "mother", "player"];

export interface Contact {
  role: Recipient;
  name: string;
  email: string;
}

const personName = (p?: { first?: string; last?: string }) =>
  [p?.first, p?.last].map((s) => s?.trim()).filter((s) => s && !/^n\/?a$/i.test(s)).join(" ");

// The people on a registration who have an email. A parent with no email of
// their own falls back to the one on the row (the first parent email the form
// had), so an older registration still reaches a parent.
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
  return out;
}

// Every email on a registration for the people picked, once each.
export function familyEmails(r: WaitlistRegistration, roles: Recipient[] = ALL_RECIPIENTS): string[] {
  return [...new Set(familyContacts(r).filter((c) => roles.includes(c.role)).map((c) => c.email))];
}

export interface FamilyGroup<T extends WaitlistRegistration> {
  emails: string[];
  registrations: T[];
}

// Brothers and sisters share parents, so they're one family and get one
// email between them, to the parents and players picked. A family with no
// email for anyone picked is left out.
export function groupFamilies<T extends WaitlistRegistration>(
  regs: T[],
  roles: Recipient[] = ALL_RECIPIENTS
): { groups: FamilyGroup<T>[]; noEmail: T[] } {
  const families = new Map<string, T[]>();
  for (const r of regs) {
    const parents = familyEmails(r, ["father", "mother"]).sort();
    const key = parents.length ? parents.join(",") : `reg:${r.id}`;
    families.set(key, [...(families.get(key) ?? []), r]);
  }
  const groups: FamilyGroup<T>[] = [];
  const noEmail: T[] = [];
  for (const members of families.values()) {
    const emails = [...new Set(members.flatMap((r) => familyEmails(r, roles)))];
    if (emails.length) groups.push({ emails, registrations: members });
    else noEmail.push(...members);
  }
  return { groups, noEmail };
}

// "Sam", "Sam and Evan", "Sam, Evan and Leo".
export function firstNames(regs: { first_name: string }[]): string {
  const names = [...new Set(regs.map((r) => r.first_name.trim()).filter(Boolean))];
  if (names.length <= 1) return names[0] ?? "your player";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// {player} in a message becomes the family's players' first names.
export function fillMessage(text: string, regs: { first_name: string }[]): string {
  return text.replace(/\{player\}/gi, firstNames(regs));
}

export const DEFAULT_SUBJECT = "Your Omaha Lightning registration";
export const DEFAULT_MESSAGE = `Hi,

Thanks for registering {player} with Omaha Lightning Basketball. Our teams are full right now, so we've added {player} to our waitlist for the 2026-27 season. We'll be in touch as soon as a spot opens.

Questions? Just reply to this email.

Omaha Lightning Basketball`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Plain text as email HTML: blank lines start paragraphs, single line
// breaks stay.
export function messageHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// Opens the reviewer's own email app, addressed to the family.
export function mailtoHref(emails: string[], subject: string): string {
  return `mailto:${emails.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}`;
}

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
const parentName = personName;

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
      parentName(x.father), x.father?.email?.trim(), x.father?.phone?.trim(),
      parentName(x.mother), x.mother?.email?.trim(), x.mother?.phone?.trim(), x.athlete_email?.trim(), x.athlete_phone?.trim(), address,
    ].map(csvCell).join(",");
  });
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
