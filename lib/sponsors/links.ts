// Sponsors whose logo links we count (0169). A logo links to
// /go/<slug>?from=live|site, which records the click and sends the visitor on
// to `url`. Add a sponsor here to start counting theirs; the Sponsors page
// routes any logo whose web address is on one of these sites through /go.

export interface SponsorLink {
  slug: string;
  name: string;
  url: string;
}

export const SPONSOR_LINKS: SponsorLink[] = [
  { slug: "nelson", name: "Nelson Produce + Farm", url: "https://www.nelsonproducefarm.com" },
  { slug: "dundee", name: "Dundee Mergers and Acquisitions", url: "https://dundeema.com" },
  { slug: "team-time", name: "Team Time", url: "https://www.teamtimehq.com" },
];

export type ClickSource = "live" | "site";

export function sponsorBySlug(slug: string): SponsorLink | undefined {
  return SPONSOR_LINKS.find((s) => s.slug === slug);
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

// The counted link for a sponsor's web address, or the address itself when
// it isn't one we count.
export function countedLink(url: string, from: ClickSource): string {
  const h = host(url);
  const s = h ? SPONSOR_LINKS.find((x) => host(x.url) === h) : undefined;
  return s ? goLink(s.slug, from) : url;
}

export function goLink(slug: string, from: ClickSource): string {
  return `/go/${slug}?from=${from}`;
}
