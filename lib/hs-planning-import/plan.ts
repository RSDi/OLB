// What importing the planning spreadsheet would do, worked out before
// anything is written: which contact types, companies and people it adds or
// fills in, and each season's weekends with the teams it found. The import
// sheet shows this as the preview; apply.ts writes it. Pure.
//
// Contacts are only ever added or filled in, never overwritten: a field that
// already has a value keeps it, tags and aliases are added to. A company
// matches one already in External Contacts by its name (or nickname, or an
// alias) or by an email address; a person matches by email, else by name at
// the same company. So importing the same spreadsheet again changes nothing.

import type { HsOpponentStatus, HsWeekendStatus } from "../hs-schedule/types.ts";
import { buildTeamIndex, findMentions, matchTeam, normalizeTeamName, type TeamCandidate } from "../hs-schedule/match.ts";
import { seasonLabel } from "../planning/season.ts";
import type { ContactBook, ContactSection, SheetCompany, SheetPerson } from "./contacts-sheet.ts";
import { eventTitle, parseEventTeams } from "./event-text.ts";
import type { SheetSeason } from "./schedule-sheet.ts";

// ─── What's already there ───────────────────────────────────────────────────

export interface ExistingCategory {
  id: string;
  name: string;
}

export interface ExistingContact {
  id: string;
  kind: "company" | "person";
  name: string;
  nickname: string | null;
  parent_contact_id: string | null;
  category_id: string | null;
  email: string | null;
  alt_email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  city: string | null;
  state: string | null;
  team_colors: string | null;
  notes: string | null;
  tags: string[];
  aliases: string[];
}

export interface ExistingSeason {
  id: string;
  season: number;
  weekends: number;
}

export interface Existing {
  categories: ExistingCategory[];
  contacts: ExistingContact[];
  seasons: ExistingSeason[];
}

// ─── The plan ───────────────────────────────────────────────────────────────

export type ContactTypeName = "Programs" | "Facilities" | "Referees";

// The contact types the import sorts into, and names already in Settings →
// Contact Types that mean the same.
export const TYPE_SYNONYMS: Record<ContactTypeName, string[]> = {
  Programs: ["programs", "program", "opponents", "opponent", "other programs", "teams", "schools"],
  Facilities: ["facilities", "facility", "gyms", "venues", "gym rentals"],
  Referees: ["referees", "referee", "officials", "refs"],
};

// How the coaches write some programs, so the schedule's team names find
// them. Added to the program's aliases (visible and editable on its page).
export const CLUB_SHORTHAND: Record<string, string[]> = {
  "omaha roadrunners": ["RR", "RoadRunner"],
  "des moines warriors": ["DMW", "DM Warriors"],
  "ne kansas": ["NEK"],
  "nwa hornets": ["NW ARK"],
  "trinity classical academy": ["TCA"],
  "iowa west sports complex": ["IA West"],
};

export interface ContactValues {
  name: string;
  title: string | null;
  email: string | null;
  alt_email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  city: string | null;
  state: string | null;
  team_colors: string | null;
  notes: string | null;
  tags: string[];
  aliases: string[];
}

export type PlanAction = "create" | "update" | "same";

export interface PlannedPerson {
  key: string;
  name: string;
  title: string | null;
  action: PlanAction;
  existingId: string | null;
  // What an update fills in, in words: "phone", "title".
  changes: string[];
  values: ContactValues;
  row: number;
}

export interface PlannedCompany {
  key: string;
  name: string;
  section: ContactSection;
  type: ContactTypeName;
  action: PlanAction;
  existingId: string | null;
  changes: string[];
  // Existing companies that might be this one ("UBT" for "UBT Sports
  // Complex"); the preview offers to use one instead of adding a new one.
  similar: { id: string; name: string }[];
  values: ContactValues;
  people: PlannedPerson[];
  row: number;
}

export interface ContactsPlan {
  typesToCreate: ContactTypeName[];
  // The type each group goes into: an existing category's id, or null when
  // it's in typesToCreate.
  typeIds: Partial<Record<ContactTypeName, string | null>>;
  companies: PlannedCompany[];
  // People on their own (referees).
  people: (PlannedPerson & { type: ContactTypeName })[];
  warnings: string[];
}

// A program or facility a weekend points at: one already in External
// Contacts, or one this import adds (by its key in the plan).
export type ContactRef = { existingId: string } | { key: string };

export interface PlannedTeam {
  name: string;
  // The program's name, when it matched one.
  program: string | null;
  ref: ContactRef | null;
  // Level labels; null = every team we bring.
  levels: string[] | null;
  status: HsOpponentStatus;
  our_score: number | null;
  their_score: number | null;
}

export interface PlannedWeekend {
  row: number;
  starts_on: string;
  ends_on: string;
  event: string;
  details: string | null;
  location: string | null;
  trip: string | null;
  status: HsWeekendStatus;
  notes: string | null;
  facility: { name: string; ref: ContactRef } | null;
  games: { label: string; games: number | null; unsure: boolean; note: string | null }[];
  teams: PlannedTeam[];
}

export interface PlannedSeason {
  sheet: string;
  season: number;
  label: string;
  title: string;
  existingId: string | null;
  existingWeekends: number;
  levels: { label: string; name: string | null; hidden: boolean }[];
  weekends: PlannedWeekend[];
  unmatched: string[];
  skipped: string[];
}

export interface ImportPlan {
  file: string;
  contacts: ContactsPlan | null;
  seasons: PlannedSeason[];
  warnings: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function typeFor(section: ContactSection): ContactTypeName {
  return section === "facility" ? "Facilities" : section === "referee" ? "Referees" : "Programs";
}

function tierTags(section: ContactSection): string[] {
  return section === "tier1" ? ["nchc"] : section === "tier2" ? ["ndii"] : [];
}

function findType(categories: ExistingCategory[], type: ContactTypeName): ExistingCategory | null {
  const names = TYPE_SYNONYMS[type];
  return categories.find((c) => names.includes(lower(c.name))) ?? null;
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = normalizeTeamName(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

function companyValues(c: SheetCompany): ContactValues {
  return {
    name: c.name.trim(),
    title: null,
    email: c.email,
    alt_email: c.altEmail,
    phone: c.phone,
    mobile_phone: null,
    city: c.city,
    state: c.state,
    team_colors: c.teamColors,
    notes: c.notes,
    tags: tierTags(c.section),
    aliases: uniq([...c.aliases, ...(CLUB_SHORTHAND[normalizeTeamName(c.name)] ?? [])]),
  };
}

function personValues(p: SheetPerson): ContactValues {
  return {
    name: p.name.trim(),
    title: p.title,
    email: p.email,
    alt_email: p.altEmail,
    phone: p.phone,
    mobile_phone: p.mobile,
    city: null,
    state: null,
    team_colors: null,
    notes: p.notes,
    tags: p.tags,
    aliases: [],
  };
}

const FIELD_WORDS: [keyof ContactValues, string][] = [
  ["title", "role"],
  ["email", "email"],
  ["alt_email", "other email"],
  ["phone", "phone"],
  ["mobile_phone", "mobile"],
  ["city", "city"],
  ["state", "state"],
  ["team_colors", "team colors"],
  ["notes", "notes"],
];

// What filling in an existing contact from the sheet would change.
export function fillIns(
  existing: ExistingContact,
  v: ContactValues,
  extra: { categoryId?: string | null; parentId?: string | null } = {}
): { changes: string[]; patch: Record<string, unknown> } {
  const changes: string[] = [];
  const patch: Record<string, unknown> = {};
  for (const [k, word] of FIELD_WORDS) {
    const next = v[k] as string | null;
    const cur = existing[k as keyof ExistingContact] as string | null;
    if (!next || (cur && cur.trim())) continue;
    // Don't add an email the contact already has in its other slot.
    if ((k === "email" || k === "alt_email") && [lower(existing.email), lower(existing.alt_email)].includes(lower(next))) continue;
    patch[k] = next;
    changes.push(word);
  }
  const tags = v.tags.filter((t) => !existing.tags.map(lower).includes(lower(t)));
  if (tags.length) {
    patch.tags = [...existing.tags, ...tags];
    changes.push(`tag${tags.length > 1 ? "s" : ""} ${tags.join(", ")}`);
  }
  const have = new Set([existing.name, existing.nickname ?? "", ...existing.aliases].map(normalizeTeamName));
  const aliases = v.aliases.filter((a) => !have.has(normalizeTeamName(a)));
  if (aliases.length) {
    patch.aliases = [...existing.aliases, ...aliases];
    changes.push(`also known as ${aliases.join(", ")}`);
  }
  if (extra.categoryId && !existing.category_id) {
    patch.category_id = extra.categoryId;
    changes.push("type");
  }
  if (extra.parentId && !existing.parent_contact_id && existing.kind === "person") {
    patch.parent_contact_id = extra.parentId;
    changes.push("company");
  }
  return { changes, patch };
}

function emailsOf(v: { email: string | null; alt_email: string | null }): string[] {
  return [v.email, v.alt_email].filter(Boolean).map((e) => lower(e));
}

// ─── Contacts ───────────────────────────────────────────────────────────────

export function planContacts(book: ContactBook, existing: Existing): ContactsPlan {
  const companies = existing.contacts.filter((c) => c.kind === "company");
  const persons = existing.contacts.filter((c) => c.kind === "person");
  const needed = new Set<ContactTypeName>([
    ...book.companies.map((c) => typeFor(c.section)),
    ...book.people.map((p) => typeFor(p.section)),
  ]);
  const typeIds: ContactsPlan["typeIds"] = {};
  const typesToCreate: ContactTypeName[] = [];
  for (const t of needed) {
    const found = findType(existing.categories, t);
    typeIds[t] = found?.id ?? null;
    if (!found) typesToCreate.push(t);
  }
  const usedExisting = new Set<string>();

  const findCompany = (c: SheetCompany): ExistingContact | null => {
    const names = [c.name, ...c.aliases].map(normalizeTeamName);
    const byName = companies.find(
      (x) =>
        !usedExisting.has(x.id) &&
        [x.name, x.nickname ?? "", ...x.aliases].map(normalizeTeamName).some((n) => n && names.includes(n))
    );
    if (byName) return byName;
    const mails = [c.email, c.altEmail, ...c.people.flatMap((p) => [p.email, p.altEmail])]
      .filter(Boolean)
      .map((e) => lower(e));
    if (!mails.length) return null;
    const byMail = companies.find((x) => !usedExisting.has(x.id) && emailsOf(x).some((e) => mails.includes(e)));
    if (byMail) return byMail;
    const personCompany = persons.find((p) => p.parent_contact_id && emailsOf(p).some((e) => mails.includes(e)));
    return personCompany ? companies.find((x) => x.id === personCompany.parent_contact_id && !usedExisting.has(x.id)) ?? null : null;
  };

  const similarTo = (c: SheetCompany): { id: string; name: string }[] => {
    const words = normalizeTeamName(c.name).split(" ");
    return companies
      .filter((x) => {
        const xs = normalizeTeamName(x.name).split(" ");
        if (!xs[0] || xs[0] !== words[0]) return false;
        const [s, l] = xs.length <= words.length ? [xs, words] : [words, xs];
        return s.every((w, i) => l[i] === w) || (xs[0].length >= 3 && s.length === 1);
      })
      .map((x) => ({ id: x.id, name: x.name }));
  };

  const planPerson = (p: SheetPerson, key: string, parentId: string | null, typeId: string | null | undefined): PlannedPerson => {
    const v = personValues(p);
    const mails = emailsOf(v);
    const match =
      (mails.length && persons.find((x) => !usedExisting.has(x.id) && emailsOf(x).some((e) => mails.includes(e)))) ||
      persons.find(
        (x) =>
          !usedExisting.has(x.id) &&
          normalizeTeamName(x.name) === normalizeTeamName(v.name) &&
          (parentId ? x.parent_contact_id === parentId : true)
      ) ||
      null;
    if (!match) return { key, name: v.name, title: v.title, action: "create", existingId: null, changes: [], values: v, row: p.row };
    usedExisting.add(match.id);
    const { changes } = fillIns(match, v, { categoryId: typeId ?? null, parentId });
    return {
      key,
      name: v.name,
      title: v.title,
      action: changes.length ? "update" : "same",
      existingId: match.id,
      changes,
      values: v,
      row: p.row,
    };
  };

  const plannedCompanies: PlannedCompany[] = book.companies.map((c) => {
    const type = typeFor(c.section);
    const v = companyValues(c);
    const match = findCompany(c);
    if (match) usedExisting.add(match.id);
    const { changes } = match ? fillIns(match, v, { categoryId: typeIds[type] ?? null }) : { changes: [] };
    const people = c.people.map((p, i) =>
      planPerson(p, `${c.key}#${i}`, match?.id ?? null, typeIds[type])
    );
    return {
      key: c.key,
      name: v.name,
      section: c.section,
      type,
      action: match ? (changes.length ? "update" : "same") : "create",
      existingId: match?.id ?? null,
      changes,
      similar: match ? [] : similarTo(c),
      values: v,
      people,
      row: c.row,
    };
  });

  const people = book.people.map((p, i) => ({
    ...planPerson(p, `person:${i}`, null, typeIds[typeFor(p.section)]),
    type: typeFor(p.section),
  }));

  return { typesToCreate, typeIds, companies: plannedCompanies, people, warnings: book.warnings };
}

// ─── Seasons ────────────────────────────────────────────────────────────────

// Teams on a weekend that isn't settled are on the fence, whatever the text
// says.
const UNSETTLED: HsWeekendStatus[] = ["tentative", "need_facility", "in_process"];

function levelName(label: string): string | null {
  if (/^v$/i.test(label)) return "Varsity";
  if (/^jv$/i.test(label)) return "Junior varsity";
  return null;
}

// The scores and the event text often name the same program ("Reno County,
// KC East Lions…" and "OLB 49 vs Reno 44"). The scored game says it all for
// that team of ours: drop the text's row for it there, and the text's
// every-team row too when that's the only team of ours playing.
function dropCoveredByScores(teams: PlannedTeam[], games: PlannedWeekend["games"], scoresLevel: string | null): PlannedTeam[] {
  if (!scoresLevel) return teams;
  const key = (t: PlannedTeam) => (t.ref ? JSON.stringify(t.ref) : `name:${t.name.toLowerCase()}`);
  const scored = new Set(teams.filter((t) => t.our_score != null).map(key));
  if (scored.size === 0) return teams;
  const othersPlay = games.some((g) => g.label !== scoresLevel && ((g.games ?? 0) > 0 || g.unsure));
  return teams.flatMap((t) => {
    if (t.our_score != null || !scored.has(key(t))) return [t];
    if (t.levels === null) return othersPlay ? [t] : [];
    const rest = t.levels.filter((l) => l !== scoresLevel);
    return rest.length ? [{ ...t, levels: rest }] : [];
  });
}

export function planSeasons(
  seasons: SheetSeason[],
  existing: Existing,
  contacts: ContactsPlan | null
): PlannedSeason[] {
  // Programs and facilities to match against: what's in External Contacts
  // under those types, plus what this import adds.
  const byType = (t: ContactTypeName) => {
    const cat = findType(existing.categories, t);
    const candidates: (TeamCandidate & { ref: ContactRef })[] = [];
    const taken = new Set<string>();
    for (const c of contacts?.companies ?? []) {
      if (c.type !== t) continue;
      const ref: ContactRef = c.existingId ? { existingId: c.existingId } : { key: c.key };
      const ex = c.existingId ? existing.contacts.find((x) => x.id === c.existingId) : null;
      if (ex) taken.add(ex.id);
      candidates.push({
        id: c.existingId ?? `key:${c.key}`,
        name: c.values.name,
        nickname: ex?.nickname ?? null,
        aliases: uniq([...(ex?.aliases ?? []), ...c.values.aliases]),
        city: c.values.city ?? ex?.city ?? null,
        ref,
      });
    }
    for (const x of existing.contacts) {
      if (x.kind !== "company" || taken.has(x.id)) continue;
      if (!cat || x.category_id !== cat.id) continue;
      candidates.push({ id: x.id, name: x.name, nickname: x.nickname, aliases: x.aliases, city: x.city, ref: { existingId: x.id } });
    }
    return candidates;
  };
  const programs = byType("Programs");
  const facilities = byType("Facilities");
  const programIndex = buildTeamIndex(programs);
  const facilityIndex = buildTeamIndex(facilities);
  const refOf = (id: string) => programs.find((p) => p.id === id) ?? null;
  const facilityOf = (id: string) => facilities.find((p) => p.id === id) ?? null;

  return seasons.map((s) => {
    const ex = existing.seasons.find((x) => x.season === s.season) ?? null;
    const unmatched = new Set<string>();
    const weekends: PlannedWeekend[] = s.weekends.map((w) => {
      const { event, details } = eventTitle(w.eventText);
      const hasGames = w.games.some((g) => (g.games ?? 0) > 0 || g.unsure);
      // "PLANNED OPEN WEEKEND" with games filled in is a weekend we play.
      const status: HsWeekendStatus = w.status === "off" && hasGames ? "planned" : w.status;
      const playing = status !== "off" && status !== "canceled";
      const teams: PlannedTeam[] = [];
      if (playing) {
        for (const t of parseEventTeams(w.eventText, programIndex, s.levels)) {
          const cand = t.matchId ? refOf(t.matchId) : null;
          if (!cand) unmatched.add(t.text);
          teams.push({
            name: cand?.name ?? t.text,
            program: cand?.name ?? null,
            ref: cand?.ref ?? null,
            levels: t.levels,
            status: t.tentative || UNSETTLED.includes(status) ? "tentative" : "confirmed",
            our_score: null,
            their_score: null,
          });
        }
        for (const sc of w.scores) {
          const m = matchTeam(programIndex, sc.opponent, { loose: true });
          const cand = m ? refOf(m.id) : null;
          if (!cand) unmatched.add(sc.opponent);
          teams.push({
            name: cand?.name ?? sc.opponent,
            program: cand?.name ?? null,
            ref: cand?.ref ?? null,
            levels: s.scoresLevel ? [s.scoresLevel] : null,
            status: "confirmed",
            our_score: sc.ours,
            their_score: sc.theirs,
          });
        }
      }
      const kept = dropCoveredByScores(teams, w.games, s.scoresLevel);
      const fm = w.notes ? findMentions(facilityIndex, w.notes).find((x) => x.match) : undefined;
      const fac = fm?.match ? facilityOf(fm.match.id) : null;
      return {
        row: w.row,
        starts_on: w.startsOn,
        ends_on: w.endsOn,
        event,
        details,
        location: w.location,
        trip: w.trip,
        status,
        notes: w.notes,
        facility: fac ? { name: fac.name, ref: fac.ref } : null,
        games: w.games,
        teams: kept,
      };
    });
    return {
      sheet: s.sheet,
      season: s.season,
      label: seasonLabel(s.season),
      title: s.title,
      existingId: ex?.id ?? null,
      existingWeekends: ex?.weekends ?? 0,
      levels: s.levels.map((l) => ({ label: l.label, name: levelName(l.label), hidden: l.hidden })),
      weekends,
      unmatched: [...unmatched].sort((a, b) => a.localeCompare(b)),
      skipped: s.skipped,
    };
  });
}

export function planImport(input: {
  file: string;
  book: ContactBook | null;
  seasons: SheetSeason[];
  existing: Existing;
  warnings?: string[];
}): ImportPlan {
  const contacts = input.book ? planContacts(input.book, input.existing) : null;
  return {
    file: input.file,
    contacts,
    seasons: planSeasons(input.seasons, input.existing, contacts),
    warnings: input.warnings ?? [],
  };
}
