// The planning spreadsheet's Contacts tab ("Master Contact List") as
// companies and people. Its layout:
//
//   Program | City | State | Contact | Role | Email | Phone | (extras)
//
// in sections, each headed by a shaded row with only column A filled:
// "NCHC / Tier I Teams", "NDII / Tier 2 Teams", "Facility Contacts",
// "Referee Contacts". A row with a Program starts a company and names its
// first person; the rows under it with column A blank are more people there
// (or, with only an email, another address for the person above or the
// program). A row with no Contact puts its email and phone on the company.
// Extra columns hold a second email, a second phone, a phone extension
// ("x206") or who the person works for. Referees are people on their own;
// column A is the games they cover ("Omaha Home Games").
//
// Below the sections, "Pivot Table from NDII" repeats the Tier 2 programs
// with their team colors and sometimes a longer name, another contact or
// another email. Those are folded into the programs above. Pure.

import { cellAt, clean, type Grid } from "./grid.ts";
import { normalizeTeamName } from "../hs-schedule/match.ts";

export type ContactSection = "tier1" | "tier2" | "facility" | "referee";

export interface SheetPerson {
  name: string;
  title: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  tags: string[];
  row: number; // the spreadsheet's row number
}

export interface SheetCompany {
  key: string;
  section: ContactSection;
  name: string;
  city: string | null;
  state: string | null;
  email: string | null;
  altEmail: string | null;
  phone: string | null;
  notes: string | null;
  teamColors: string | null;
  aliases: string[];
  people: SheetPerson[];
  row: number;
}

export interface ContactBook {
  companies: SheetCompany[];
  // People with no company: the referees.
  people: (SheetPerson & { section: ContactSection })[];
  warnings: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailOf(s: string): string | null {
  const t = clean(s).replace(/^mailto:/i, "");
  return EMAIL.test(t) ? t : null;
}

function phoneLike(s: string): boolean {
  return (s.match(/\d/g) ?? []).length >= 7 && !/@/.test(s);
}

function value(s: string): string | null {
  const t = clean(s);
  return t ? t : null;
}

function sectionOf(text: string): ContactSection | "pivot" | null {
  if (/pivot/i.test(text)) return "pivot";
  if (/nchc|tier\s*(i|1)\b/i.test(text)) return "tier1";
  if (/ndii|tier\s*(ii|2)\b/i.test(text)) return "tier2";
  if (/facilit/i.test(text)) return "facility";
  if (/referee|officials/i.test(text)) return "referee";
  return null;
}

// Does an address look like the program's own ("desmoinesdefenders@…" for
// Des Moines Defenders), rather than a person's?
export function emailResembles(email: string, company: string): boolean {
  const e = email.toLowerCase().replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]/g, "");
  const words = normalizeTeamName(company).split(" ").filter((w) => w.length >= 4);
  const compact = normalizeTeamName(company).replace(/ /g, "");
  return (compact.length >= 6 && e.includes(compact)) || words.some((w) => e.includes(w));
}

// Parenthesized short names in a program's name: "(CFE)", "(SVHE)".
export function acronymsIn(name: string): string[] {
  return [...name.matchAll(/\(([A-Z]{2,6})\)/g)].map((m) => m[1]);
}

// "Omaha Home Games" → ["omaha"]; "Lincoln / Omaha Home Games" → ["lincoln",
// "omaha"]; 'Wichita "Pool"' → ["wichita"].
export function areaTags(area: string): string[] {
  return clean(area.replace(/["“”]/g, " "))
    .replace(/\bhome games?\b/gi, "")
    .replace(/\bpool\b/gi, "")
    .split("/")
    .map((s) => clean(s).toLowerCase())
    .filter(Boolean);
}

export function companyKey(section: ContactSection, name: string): string {
  const group = section === "tier1" || section === "tier2" ? "program" : section;
  return `${group}:${normalizeTeamName(name)}`;
}

interface Columns {
  program: number;
  city: number;
  state: number;
  contact: number;
  role: number;
  email: number;
  phone: number;
  extras: number[];
}

function findHeader(grid: Grid): { row: number; cols: Columns } | null {
  for (let r = 0; r < Math.min(grid.rows.length, 30); r++) {
    const texts = (grid.rows[r] ?? []).map((c) => c.text.toLowerCase());
    const at = (re: RegExp) => texts.findIndex((t) => re.test(t));
    const program = at(/^(program|organization|company|name)$/);
    const contact = at(/^contact( name)?$/);
    const email = at(/^e-?mail$/);
    if (program < 0 || contact < 0 || email < 0) continue;
    const phone = at(/^phone/);
    const width = texts.length;
    const known = new Set([program, at(/^city$/), at(/^state$/), contact, at(/^(role|title)$/), email, phone]);
    const extras: number[] = [];
    for (let c = Math.max(phone, email) + 1; c < Math.max(width, Math.max(phone, email) + 4); c++) {
      if (!known.has(c)) extras.push(c);
    }
    return {
      row: r,
      cols: { program, city: at(/^city$/), state: at(/^state$/), contact, role: at(/^(role|title)$/), email, phone, extras },
    };
  }
  return null;
}

export function parseContactsSheet(grid: Grid): ContactBook {
  const warnings: string[] = [];
  const header = findHeader(grid);
  if (!header) return { companies: [], people: [], warnings: [`"${grid.name}": no Program / Contact / Email header row.`] };
  const { cols } = header;
  const companies: SheetCompany[] = [];
  const people: ContactBook["people"] = [];
  const pivot: { name: string; colors: string | null; place: string | null; contact: string | null; email: string | null; row: number }[] = [];
  let section: ContactSection | "pivot" | null = null;
  let company: SheetCompany | null = null;
  let lastPerson: SheetPerson | null = null;

  const txt = (r: number, c: number) => (c >= 0 ? cellAt(grid, r, c).text : "");

  for (let r = header.row + 1; r < grid.rows.length; r++) {
    const a = txt(r, cols.program);
    const rest = [cols.city, cols.state, cols.contact, cols.role, cols.email, cols.phone].map((c) => txt(r, c));
    const extras = cols.extras.map((c) => txt(r, c)).filter(Boolean);
    if (!a && rest.every((x) => !x) && extras.length === 0) continue;

    // A section heading: column A only.
    if (a && rest.every((x) => !x) && extras.length === 0) {
      const s = sectionOf(a);
      if (s) {
        section = s;
        company = null;
        lastPerson = null;
      }
      continue;
    }
    if (!section) continue;

    if (section === "pivot") {
      // Program | Colors | "City, ST" | Contact | Email
      pivot.push({
        name: a,
        colors: value(txt(r, 1)),
        place: value(txt(r, 2)),
        contact: value(txt(r, 3)),
        email: emailOf(txt(r, 4)),
        row: r + 1,
      });
      continue;
    }

    const [city, state, contactName, role, emailText, phoneText] = rest;
    const email = emailOf(emailText);
    if (emailText && !email) warnings.push(`Row ${r + 1}: "${emailText}" isn't an email address, skipped.`);

    if (section === "referee") {
      if (!contactName) continue;
      const p: SheetPerson & { section: ContactSection } = {
        section,
        name: contactName,
        title: value(role),
        email,
        altEmail: null,
        phone: value(phoneText),
        mobile: null,
        notes: a ? `Referee area: ${clean(a.replace(/["“”]/g, ""))}` : null,
        tags: a ? areaTags(a) : [],
        row: r + 1,
      };
      people.push(p);
      lastPerson = p;
      continue;
    }

    if (a) {
      const key = companyKey(section, a);
      const existing = companies.find((c) => c.key === key);
      company =
        existing ??
        (() => {
          const c: SheetCompany = {
            key,
            section: section as ContactSection,
            name: a,
            city: value(city),
            state: value(state)?.toUpperCase() ?? null,
            email: null,
            altEmail: null,
            phone: null,
            notes: null,
            teamColors: null,
            aliases: acronymsIn(a),
            people: [],
            row: r + 1,
          };
          companies.push(c);
          return c;
        })();
      lastPerson = null;
    }
    if (!company) continue;

    if (contactName) {
      const p: SheetPerson = {
        name: contactName,
        title: value(role),
        email,
        altEmail: null,
        phone: value(phoneText),
        mobile: null,
        notes: null,
        tags: [],
        row: r + 1,
      };
      company.people.push(p);
      lastPerson = p;
    } else if (a) {
      // No name: the details are the program's own.
      if (email) company.email = company.email ?? email;
      if (phoneText) company.phone = company.phone ?? value(phoneText);
      if (role && email) company.notes = [company.notes, `${role}: ${email}`].filter(Boolean).join("\n");
      else if (role) company.notes = [company.notes, `Contact: ${role}`].filter(Boolean).join("\n");
    } else if (email) {
      // A row with only an email: the program's inbox, or another address
      // for the person above.
      placeLeftoverEmail(company, lastPerson, email);
    } else if (phoneText) {
      if (lastPerson && !lastPerson.mobile) lastPerson.mobile = value(phoneText);
      else company.phone = company.phone ?? value(phoneText);
    }

    for (const x of extras) {
      const target = contactName ? lastPerson : null;
      const e = emailOf(x);
      if (e) {
        if (emailResembles(e, company.name) && !company.email) company.email = e;
        else if (target && !target.altEmail && target.email !== e) target.altEmail = e;
        else if (!company.email) company.email = e;
        continue;
      }
      if (/^x\s*\d{1,6}$/i.test(x)) {
        // A phone extension for the number beside it.
        if (target?.phone) target.phone = `${target.phone} ${x.replace(/\s+/g, "")}`;
        else if (company.phone) company.phone = `${company.phone} ${x.replace(/\s+/g, "")}`;
        continue;
      }
      if (phoneLike(x)) {
        if (target && !target.mobile) target.mobile = x;
        else if (!company.phone) company.phone = x;
        continue;
      }
      if (target) target.notes = [target.notes, `Works for ${x}`].filter(Boolean).join("\n");
      else company.notes = [company.notes, x].filter(Boolean).join("\n");
    }
  }

  foldPivot(companies, pivot, warnings);
  return { companies, people, warnings };
}

function placeLeftoverEmail(company: SheetCompany, person: SheetPerson | null, email: string) {
  const lower = email.toLowerCase();
  const taken = [company.email, company.altEmail, ...company.people.flatMap((p) => [p.email, p.altEmail])]
    .filter(Boolean)
    .map((x) => x!.toLowerCase());
  if (taken.includes(lower)) return;
  if (emailResembles(email, company.name)) {
    if (!company.email) company.email = email;
    else if (!company.altEmail) company.altEmail = email;
    return;
  }
  if (person && !person.email) person.email = email;
  else if (person && !person.altEmail) person.altEmail = email;
  else if (!company.email) company.email = email;
}

function sameName(a: string, b: string): boolean {
  const x = normalizeTeamName(a).split(" ");
  const y = normalizeTeamName(b).split(" ");
  if (x.join("") === y.join("")) return true;
  // One is the other plus a mascot or a short name in parentheses:
  // "Smoky Valley" / "Smoky Valley (SVHE) Eagles", "NE Kansas" / "Northeast
  // Kansas Nighthawks", "Manhattan Chiefs" / "Manhattan CHIEF Thunder".
  // "NE" for Northeast: the same first letter, its letters in order.
  const abbrev = (w: string, l: string) => {
    if (w.length < 2 || w.length >= l.length || w[0] !== l[0]) return false;
    let k = 0;
    for (const ch of l) if (ch === w[k]) k++;
    return k === w.length;
  };
  const same = (w: string, l: string) => l === w || l.startsWith(w) || w.startsWith(l) || abbrev(w, l) || abbrev(l, w);
  const fits = (s: string[], l: string[]) => {
    let j = 0;
    for (const w of s) {
      while (j < l.length && !same(w, l[j])) j++;
      if (j >= l.length) return false;
      j++;
    }
    return true;
  };
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 1 && short[0] !== "" && same(short[0], long[0]) && fits(short, long);
}

// The NDII pivot table: team colors, the program's longer name (kept as an
// alias), and any contact or email the main list doesn't have. A pivot row
// whose email belongs to someone listed under a differently named program is
// its own program ("Newton Panthers", listed under Newton Mustangs above).
function foldPivot(
  companies: SheetCompany[],
  pivot: { name: string; colors: string | null; place: string | null; contact: string | null; email: string | null; row: number }[],
  warnings: string[]
) {
  const programs = () => companies.filter((c) => c.section === "tier1" || c.section === "tier2");
  for (const p of pivot) {
    const byName = programs().find((c) => sameName(c.name, p.name));
    const lower = p.email?.toLowerCase() ?? null;
    const byEmail = lower
      ? programs().find(
          (c) =>
            c.email?.toLowerCase() === lower ||
            c.altEmail?.toLowerCase() === lower ||
            c.people.some((x) => x.email?.toLowerCase() === lower || x.altEmail?.toLowerCase() === lower)
        )
      : undefined;
    let company = byName ?? null;
    if (!company && byEmail) {
      const person = byEmail.people.find(
        (x) => x.email?.toLowerCase() === lower || x.altEmail?.toLowerCase() === lower
      );
      // The program's first contact is the program; anyone listed under
      // them with a different program's name in the table is that program's.
      if (person && byEmail.people.indexOf(person) > 0 && !sameName(byEmail.name, p.name)) {
        // Its own program: move the person there.
        byEmail.people = byEmail.people.filter((x) => x !== person);
        const [city, state] = (p.place ?? "").split(",").map((s) => value(s));
        company = {
          key: companyKey("tier2", p.name),
          section: "tier2",
          name: clean(p.name),
          city: city ?? null,
          state: state?.toUpperCase() ?? null,
          email: null,
          altEmail: null,
          phone: null,
          notes: null,
          teamColors: null,
          aliases: acronymsIn(p.name),
          people: [person],
          row: p.row,
        };
        companies.push(company);
      } else {
        company = byEmail;
      }
    }
    if (!company) {
      warnings.push(`Row ${p.row}: "${p.name}" from the NDII table isn't in the lists above, skipped.`);
      continue;
    }
    if (p.colors && !company.teamColors) company.teamColors = p.colors;
    if (!sameExact(company.name, p.name)) {
      for (const a of [clean(p.name), ...acronymsIn(p.name)]) {
        if (!company.aliases.some((x) => normalizeTeamName(x) === normalizeTeamName(a))) company.aliases.push(a);
      }
    }
    if (p.place && (!company.city || !company.state)) {
      const [city, state] = p.place.split(",").map((s) => value(s));
      company.city = company.city ?? city ?? null;
      company.state = company.state ?? state?.toUpperCase() ?? null;
    }
    if (!p.contact && p.email) {
      placeLeftoverEmail(company, null, p.email);
      continue;
    }
    if (!p.contact) continue;
    // The same person, by name ("Chris and Heather Day" is Heather Day).
    const person = company.people.find((x) => samePerson(x.name, p.contact!));
    if (person) {
      if (p.email) placeLeftoverEmail(company, person, p.email);
      continue;
    }
    // Someone new. An address another person here already uses is the
    // program's shared inbox: say so rather than give it to two people.
    const shared =
      lower &&
      [company.email, company.altEmail, ...company.people.flatMap((x) => [x.email, x.altEmail])].some(
        (e) => e?.toLowerCase() === lower
      );
    company.people.push({
      name: p.contact,
      title: null,
      email: shared ? null : p.email,
      altEmail: null,
      phone: null,
      mobile: null,
      notes: shared ? `Uses the program's email, ${p.email}.` : null,
      tags: [],
      row: p.row,
    });
  }
}

// "Heather Day" and "Chris and Heather Day"; "Jeremy Plathe" twice.
function samePerson(a: string, b: string): boolean {
  const x = normalizeTeamName(a);
  const y = normalizeTeamName(b);
  if (!x || !y) return false;
  return x === y || (x.split(" ").length >= 2 && y.includes(x)) || (y.split(" ").length >= 2 && x.includes(y));
}

function sameExact(a: string, b: string): boolean {
  return normalizeTeamName(a) === normalizeTeamName(b);
}
