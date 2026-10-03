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

// The parents' emails on a registration, else the one on the row, else the
// player's own. Lowercase, no repeats.
export function familyEmails(r: WaitlistRegistration): string[] {
  const parents = [r.extra.father?.email, r.extra.mother?.email].map(clean).filter((e): e is string => !!e);
  const found = parents.length ? parents : [clean(r.parent_email), clean(r.extra.athlete_email)].filter((e): e is string => !!e).slice(0, 1);
  return [...new Set(found)];
}

export interface FamilyGroup<T extends WaitlistRegistration> {
  emails: string[];
  registrations: T[];
}

// One group per set of parents, so brothers and sisters on the waitlist get
// one email between them. Registrations with no email at all are left out.
export function groupFamilies<T extends WaitlistRegistration>(regs: T[]): { groups: FamilyGroup<T>[]; noEmail: T[] } {
  const groups = new Map<string, FamilyGroup<T>>();
  const noEmail: T[] = [];
  for (const r of regs) {
    const emails = familyEmails(r);
    if (emails.length === 0) {
      noEmail.push(r);
      continue;
    }
    const key = [...emails].sort().join(",");
    const g = groups.get(key) ?? { emails, registrations: [] };
    g.registrations.push(r);
    groups.set(key, g);
  }
  return { groups: [...groups.values()], noEmail };
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

Thanks for registering {player} with Omaha Lightning Basketball. Our teams are full right now, so {player} is on our waitlist for the 2026-27 season. We'll be in touch as soon as a spot opens.

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

// Every email on the list once, for pasting into Bcc.
export function allEmails(regs: WaitlistRegistration[]): string[] {
  return [...new Set(regs.flatMap(familyEmails))];
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
const parentName = (p?: { first?: string; last?: string }) =>
  [p?.first, p?.last].map((s) => s?.trim()).filter((s) => s && !/^n\/?a$/i.test(s)).join(" ");

// The waitlist as a spreadsheet (CSV), oldest registration first.
export function waitlistCsv(rows: WaitlistRow[]): string {
  const head = [
    "Player", "Birthday", "Fee", "Registered", "Waitlisted", "Waitlisted by", "Note", "Contacted", "Contacted by",
    "Father", "Father email", "Father phone", "Mother", "Mother email", "Mother phone", "Address",
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
      parentName(x.mother), x.mother?.email?.trim(), x.mother?.phone?.trim(), address,
    ].map(csvCell).join(",");
  });
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
