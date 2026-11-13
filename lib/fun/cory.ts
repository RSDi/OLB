// The Coach Cory exclamation counter: how many exclamation points Coach Cory
// has used in Slack. Jeff keeps it up to date in Settings → Coach Cory !, and
// the public page at /! (app/(standalone)/exclamation) shows it. It's one row
// in site_content, which anyone can read and the Website grant can change.
// Safe to import from client components.

export const CORY_KEY = "fun.cory_exclamations";
export const CORY_MAX = 9_999_999;

// The saved count, or 0 when it's missing or not a whole number.
export function parseCoryCount(value: string | null | undefined): number {
  const n = Number((value ?? "").trim());
  return Number.isInteger(n) && n >= 0 && n <= CORY_MAX ? n : 0;
}

// What someone typed into the box: a whole number from 0 up, commas allowed.
export function coryCountFromInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= CORY_MAX ? n : null;
}
