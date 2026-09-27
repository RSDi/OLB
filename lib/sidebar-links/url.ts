// Sidebar links (Settings → Sidebar Links): the shared shape and the address
// clean-up used by both the form and the server actions. Safe to import from
// client components.

export interface SidebarLink {
  id: string;
  label: string;
  url: string;
  open_in_new_tab: boolean;
  sort_order: number;
}

export const SIDEBAR_LINK_LABEL_MAX = 40;

// Turns what someone typed into an address the sidebar can link to, or null
// when it isn't one. Accepts full http(s) addresses, bare domains
// ("schedule.example.com" → "https://schedule.example.com") and portal paths
// ("/portal/docs"). Mirrors the url check in migration 0096.
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
