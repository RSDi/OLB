// Grouping the External Contacts list by company: each company with the
// people who work there, then the people on their own. Pure, so the list and
// its tests share it.

import type { Contact } from "./data";

export interface ContactGroup {
  company: Contact;
  // Who to show under it: everyone when the company itself matches the
  // search and filters, else just the people who do.
  people: Contact[];
  // How many people work there in all, matching or not.
  total: number;
  companyMatches: boolean;
}

function byName(a: Contact, b: Contact): number {
  const an = (a.nickname?.trim() || a.name).toLowerCase();
  const bn = (b.nickname?.trim() || b.name).toLowerCase();
  return an.localeCompare(bn);
}

export function groupContacts(
  contacts: Contact[],
  matches: (c: Contact) => boolean
): { groups: ContactGroup[]; independent: Contact[] } {
  const companies = contacts.filter((c) => c.kind === "company");
  const companyIds = new Set(companies.map((c) => c.id));
  const peopleAt = new Map<string, Contact[]>();
  const independent: Contact[] = [];
  for (const p of contacts) {
    if (p.kind !== "person") continue;
    if (p.parent_contact_id && companyIds.has(p.parent_contact_id)) {
      const list = peopleAt.get(p.parent_contact_id) ?? [];
      list.push(p);
      peopleAt.set(p.parent_contact_id, list);
    } else if (matches(p)) {
      // No company, or one that's been deleted.
      independent.push(p);
    }
  }
  const groups: ContactGroup[] = [];
  for (const company of [...companies].sort(byName)) {
    const all = (peopleAt.get(company.id) ?? []).sort(byName);
    const companyMatches = matches(company);
    const people = companyMatches ? all : all.filter(matches);
    if (!companyMatches && people.length === 0) continue;
    groups.push({ company, people, total: all.length, companyMatches });
  }
  return { groups, independent: independent.sort(byName) };
}

// "Ames, IA", "Ames", "IA", or null.
export function placeLabel(c: Pick<Contact, "city" | "state">): string | null {
  const parts = [c.city?.trim(), c.state?.trim()].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
