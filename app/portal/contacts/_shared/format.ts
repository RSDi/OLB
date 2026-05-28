// Display helpers for the contacts UI. Pure functions — no DB calls — so
// they can be imported by either server or client components.

import type { Contact, ContactKind } from "./data";

export function kindLabel(kind: ContactKind): string {
  return kind === "company" ? "Company" : "Person";
}

export function displayName(c: Pick<Contact, "name" | "nickname">): string {
  if (c.nickname && c.nickname.trim()) return c.nickname.trim();
  return c.name;
}

// "Sales · Mon · 555-1212" — joins together non-empty bits with separators
// so the contact list row stays readable when fields are missing.
export function composeSubtitle(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ? p.trim() : ""))
    .filter((p) => p.length > 0)
    .join(" · ");
}

// Normalize a phone for a tel: link. Strips everything except digits and
// the leading +.
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.length < 4) return null;
  return `tel:${cleaned}`;
}

// Normalize a URL for an external link — adds https:// if the user typed a
// bare domain.
export function externalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Split a comma-separated tag input string into a clean string[]. Trims
// whitespace, drops empties, lowercases for consistency. Used by the form.
export function parseTags(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
}

// Render tags back as a single string for the form's <input>.
export function tagsToInput(tags: string[]): string {
  return tags.join(", ");
}
