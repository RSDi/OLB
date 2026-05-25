// Small formatting helpers shared across directory views.

import type { DirectoryMember } from "./data";

export function displayName(m: Pick<DirectoryMember, "full_name" | "email">): string {
  return m.full_name ?? m.email ?? "Unknown";
}

export function firstName(m: Pick<DirectoryMember, "full_name" | "email">): string {
  const name = (m.full_name ?? "").trim();
  if (!name) return displayName(m);
  return name.split(/\s+/)[0];
}

export function lastNameLower(m: Pick<DirectoryMember, "full_name" | "email">): string {
  const name = (m.full_name ?? m.email ?? "").trim();
  if (!name) return "";
  const parts = name.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

// Returns "May 12" for ISO date "1980-05-12" — strips the year, which is the
// church-directory convention for birthday display.
export function formatMonthDay(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return null;
  const date = new Date(2000, m - 1, d);
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthOf(iso: string | null): number | null {
  if (!iso) return null;
  const [, m] = iso.split("-").map(Number);
  return m && m >= 1 && m <= 12 ? m : null;
}

export function dayOf(iso: string | null): number | null {
  if (!iso) return null;
  const [, , d] = iso.split("-").map(Number);
  return d && d >= 1 && d <= 31 ? d : null;
}

export function monthName(m: number): string {
  return MONTH_NAMES[m - 1] ?? "";
}

// Returns the milestone label that applies in `year` for someone with the
// given birthday ISO. e.g. "Sweet 16" / "21st" / "50th" / null.
export function birthdayMilestone(birthdayIso: string | null, year: number): string | null {
  if (!birthdayIso) return null;
  const birthYear = Number(birthdayIso.slice(0, 4));
  if (!birthYear) return null;
  const age = year - birthYear;
  if (age === 16) return "Sweet 16";
  if (age === 21) return "21st";
  if (age > 0 && age % 10 === 0) return `${age}th`;
  return null;
}

// "Wiffleball" eligibility ladder MCC uses. Turning 13 = eligible, turning 12
// = reserve. Returns null otherwise.
export function wiffleballFlag(birthdayIso: string | null, year: number): "eligible" | "reserve" | null {
  if (!birthdayIso) return null;
  const birthYear = Number(birthdayIso.slice(0, 4));
  if (!birthYear) return null;
  const age = year - birthYear;
  if (age === 13) return "eligible";
  if (age === 12) return "reserve";
  return null;
}

// "20+", "50+", "10 years in 2026" style label for an anniversary in `year`.
export function anniversaryMilestone(anniversaryIso: string | null, year: number): string | null {
  if (!anniversaryIso) return null;
  const annYear = Number(anniversaryIso.slice(0, 4));
  if (!annYear) return null;
  const yearsMarried = year - annYear;
  if (yearsMarried <= 0) return null;
  if (yearsMarried % 5 === 0) return `${yearsMarried} years`;
  return null;
}
