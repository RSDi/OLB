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

// A public page as words: "/" → "Home", "/player-registration" → "Player
// Registration".
export function sitePageLabel(path: string): string {
  const pathname = path.split("?")[0].replace(/\/+$/, "");
  if (!pathname) return "Home";
  return pathname
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");
}
