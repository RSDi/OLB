// Sidebar links (Settings → Sidebar Links): the shared shape and the address
// clean-up used by both the form and the server actions. Safe to import from
// client components.

export interface SidebarLink {
  id: string;
  label: string;
  url: string;
  open_in_new_tab: boolean;
  // Opens inside the portal, on /portal/links/<id> (0114). Never with
  // open_in_new_tab, and only for outside sites.
  open_in_frame: boolean;
  sort_order: number;
}

// How a link opens: its own browser tab, in place of the portal, or inside
// the portal with the sidebar still around it.
export type SidebarLinkMode = "new_tab" | "same_tab" | "frame";

export function sidebarLinkMode(link: Pick<SidebarLink, "open_in_new_tab" | "open_in_frame">): SidebarLinkMode {
  if (link.open_in_frame) return "frame";
  return link.open_in_new_tab ? "new_tab" : "same_tab";
}

// A portal page is already inside the portal, so only outside sites can open
// in a frame.
export function canOpenInFrame(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

// Where the sidebar sends people for a link that opens inside the portal.
export function sidebarFrameHref(id: string): string {
  return `/portal/links/${id}`;
}

export const SIDEBAR_LINK_LABEL_MAX = 40;

// Turns what someone typed into an address the sidebar can link to, or null
// when it isn't one. Accepts full http(s) addresses, bare domains
// ("schedule.example.com" → "https://schedule.example.com") and portal paths
// ("/portal/docs"). Mirrors the url check in migration 0097.
export function normalizeSidebarUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || /\s/.test(s)) return null;
  if (s.startsWith("/")) return s.startsWith("//") ? null : s;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return null;
  return withScheme;
}

// Whether a site's response headers forbid showing it in a frame on
// another site (`ourHost`, like "olb.example.com"): X-Frame-Options, or a
// Content-Security-Policy frame-ancestors list that doesn't name us.
export function refusesFraming(
  headers: { xFrameOptions: string | null; contentSecurityPolicy: string | null },
  ourHost: string
): boolean {
  const xfo = headers.xFrameOptions?.trim().toLowerCase();
  // DENY and SAMEORIGIN both rule us out (we're a different site); browsers
  // ignore the obsolete ALLOW-FROM, and so do we.
  const xfoBlocks = !!xfo && (xfo.startsWith("deny") || xfo.startsWith("sameorigin"));

  const directive = (headers.contentSecurityPolicy ?? "")
    .split(/[;,]/)
    .map((d) => d.trim().toLowerCase())
    .find((d) => d.startsWith("frame-ancestors"));
  // frame-ancestors, when present, overrides X-Frame-Options.
  if (directive === undefined) return xfoBlocks;
  const sources = directive.split(/\s+/).slice(1);
  const host = ourHost.toLowerCase();
  return !sources.some((src) => {
    if (src === "*" || src === "https:") return true;
    const bare = src.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    if (bare.startsWith("*.")) return host.endsWith(bare.slice(1));
    return bare === host;
  });
}
