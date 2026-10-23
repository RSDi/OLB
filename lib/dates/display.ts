// Displayed dates and times on the site (admin and public) use the club's
// timezone, America/Chicago. A date-only value ("YYYY-MM-DD") is a calendar
// day and is not shifted. A timestamp (created_at and the like) is shown on
// the Chicago clock, not UTC — an evening in Omaha must not print as the
// next UTC morning.
//
// Pure, no dependencies; safe for client and server.

import { CHURCH_TZ } from "./today.ts"; // explicit extension so node --test can load this file

export const DISPLAY_TZ = CHURCH_TZ;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function instant(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDisplayDate(
  iso: string | null | undefined,
  opts?: { year?: boolean },
): string | null {
  if (!iso?.trim()) return null;
  const raw = iso.trim();
  const ymd = DATE_ONLY.exec(raw);
  const year = opts?.year === false ? undefined : ("numeric" as const);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (!y || !m || !d) return raw;
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year,
      timeZone: "UTC",
    });
  }
  const d = instant(raw);
  if (!d) return null;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year,
    timeZone: DISPLAY_TZ,
  });
}

export function formatDisplayDateTime(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = instant(iso.trim());
  if (!d) return null;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TZ,
  });
}

// "YYYY-MM-DD" on the Chicago clock for a timestamp; a date-only value
// comes back as itself. Used in spreadsheets and filenames people see.
export function formatDisplayYmd(iso: string | null | undefined): string {
  if (!iso?.trim()) return "";
  const raw = iso.trim();
  if (DATE_ONLY.test(raw)) return raw;
  const d = instant(raw);
  if (!d) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TZ }).format(d);
}
