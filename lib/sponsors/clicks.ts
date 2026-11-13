// Sponsor link clicks (0169), added up for the board: per sponsor, the
// clicks, the people (different browsers), where they clicked from, and
// when the last one was. Every counted sponsor gets a row, even at zero.

import { SPONSOR_LINKS } from "./links.ts";

export interface ClickRow {
  sponsor: string;
  source: string;
  visitor_id: string;
  created_at: string;
}

export interface SponsorClickTotals {
  slug: string;
  name: string;
  clicks: number;
  people: number;
  live: number;
  site: number;
  lastAt: string | null;
}

export function sumClicks(rows: ClickRow[]): SponsorClickTotals[] {
  const known = SPONSOR_LINKS.map((s) => s.slug);
  const extra = [...new Set(rows.map((r) => r.sponsor))].filter((s) => !known.includes(s));
  return [...known, ...extra]
    .map((slug) => {
      const mine = rows.filter((r) => r.sponsor === slug);
      return {
        slug,
        name: SPONSOR_LINKS.find((s) => s.slug === slug)?.name ?? slug,
        clicks: mine.length,
        people: new Set(mine.map((r) => r.visitor_id)).size,
        live: mine.filter((r) => r.source === "live").length,
        site: mine.filter((r) => r.source === "site").length,
        lastAt: mine.reduce<string | null>((a, r) => (a == null || r.created_at > a ? r.created_at : a), null),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || a.name.localeCompare(b.name));
}
