// Website activity (migration 0161): working out where a visit came from and
// what it was on, from the referrer, the address and the user agent. Pure;
// safe to import from client components and tests.

// Referring sites people recognise, by host. Checked in order, so mail.google
// comes before google.
const KNOWN_SOURCES: [RegExp, string][] = [
  [/(^|\.)mail\.google\./, "Email"],
  [/(^|\.)outlook\.(live|office)\.com$/, "Email"],
  [/(^|\.)mail\.yahoo\./, "Email"],
  [/(^|\.)google\./, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\./, "Yahoo"],
  [/(^|\.)(facebook\.com|fb\.me|fb\.com)$/, "Facebook"],
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "X"],
  [/(^|\.)slack\.com$/, "Slack"],
  [/(^|\.)youtube\.com$/, "YouTube"],
];

// The referring site's host, or "" when there isn't one or it's this site.
export function referrerHost(referrer: string | null | undefined, ownHost: string | null | undefined): string {
  if (!referrer) return "";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "";
  }
  const own = (ownHost ?? "").toLowerCase().split(":")[0];
  if (!host || host === own || host === "localhost") return "";
  return host.slice(0, 200);
}

// A friendly name for where a visit came from. A link's utm_source wins
// ("?utm_source=newsletter"); otherwise the referring site. "" is direct:
// typed in, a bookmark, or an app that doesn't say.
export function visitSource(path: string, host: string): string {
  const query = path.split("?")[1] ?? "";
  const utm = new URLSearchParams(query).get("utm_source")?.trim();
  if (utm) return utm.slice(0, 60);
  if (!host) return "";
  for (const [re, name] of KNOWN_SOURCES) if (re.test(host)) return name;
  return host.replace(/^www\./, "");
}

export type Device = "phone" | "tablet" | "computer";

export function deviceOf(userAgent: string | null | undefined): Device {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return "phone";
  return "computer";
}

// Crawlers and link previews that run scripts. Not counted.
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? "";
  if (!ua) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|monitor/i.test(ua);
}

// Public pages only: the portal has its own trail, and API calls aren't pages.
export function isSitePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/^\/(portal|api|auth|_next)(\/|\?|$)/.test(path)
  );
}

// The website's own pages and the names Website Activity shows for them.
// Pages added in Settings → Website → New pages (/fall-camp) aren't listed:
// they're looked up when recorded and named from their address.
// tests/unit/website-tracking.test.ts fails when a public page is missing.
const PAGE = "[^/]+";
export const SITE_PAGES: [RegExp, string][] = [
  [/^\/$/, "Home"],
  [/^\/programs$/, "Programs"],
  [/^\/coaches$/, "Coaches"],
  [/^\/philosophy$/, "Philosophy"],
  [/^\/history$/, "History"],
  [/^\/contact$/, "Contact"],
  [/^\/sponsors$/, "Sponsors"],
  [/^\/summer$/, "Summer"],
  [/^\/player-registration$/, "Player Registration"],
  [/^\/waitlist$/, "Join the Waitlist"],
  [/^\/14u-assessment$/, "14U Assessment"],
  [/^\/assessments$/, "Assessments"],
  [new RegExp(`^/assessments/${PAGE}$`), "An assessment's sign-up"],
  [/^\/assistance$/, "Assistance"],
  [/^\/assistance\/building$/, "Assistance · Building fund"],
  [/^\/assistance\/maintenance$/, "Assistance · Maintenance fund"],
  [new RegExp(`^/sign-up/${PAGE}$`), "A clinic or workout sign-up"],
  [new RegExp(`^/family/${PAGE}$`), "A family's checklist (private link)"],
  [/^\/login$/, "Portal sign-in"],
  [/^\/login\/phone$/, "Portal sign-in with a phone"],
  [/^\/login\/phone\/preview$/, "Portal sign-in with a phone (preview)"],
  [new RegExp(`^/pair/${PAGE}$`), "Approve a device (portal sign-in)"],
  [/^\/register$/, "Request portal access"],
  [/^\/reset-password$/, "Reset portal password"],
  [/^\/mockups$/, "Mock-ups (not live)"],
  [/^\/mockups\/court-sponsors$/, "Mock-up: court sponsors (not live)"],
  // Reached at /! too, which keeps that address in the browser.
  [/^\/(exclamation|!|%21)$/, "Coach Cory's exclamation counter"],
  [/^\/shootout$/, "Shootout live scores"],
  [/^\/shootout\/tv\/admission$/, "Shootout TV · Admission"],
  [new RegExp(`^/shootout/tv(/${PAGE})?$`), "Shootout TV · Scoreboard"],
  [/^\/shootout\/score$/, "Shootout scorer's table"],
  [/^\/shootout\/signs$/, "Shootout signs"],
];

function pathnameOf(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

// The name of one of the website's own pages, or null when the address isn't
// one (a New page, or an address that doesn't exist).
export function knownPageLabel(path: string): string | null {
  const pathname = pathnameOf(path);
  for (const [re, label] of SITE_PAGES) if (re.test(pathname)) return label;
  return null;
}

// "/fall-camp" → "fall-camp": an address that could be a New page.
export function newPageSlug(path: string): string | null {
  const m = /^\/([a-z0-9-]+)$/i.exec(pathnameOf(path));
  return m ? m[1] : null;
}

// A public page as words: "/" → "Home", "/shootout" → "Shootout live
// scores", a New page at "/fall-camp" → "Fall Camp".
export function sitePageLabel(path: string): string {
  const known = knownPageLabel(path);
  if (known) return known;
  return pathnameOf(path)
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");
}
