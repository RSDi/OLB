// Display helpers for the Activity page: a recorded path as words people
// recognise ("Directory · Profile"), durations, relative times and devices.
// Pure; safe to import from client components.

// Section names, by the path's first segment after /portal.
const SECTIONS: Record<string, string> = {
  "": "Dashboard",
  directory: "Directory",
  contacts: "External Contacts",
  docs: "Playbooks",
  "slack-archive": "Slack Archive",
  guide: "User Guide",
  settings: "Settings",
  activity: "Activity",
  teams: "Teams",
  events: "Events",
  tasks: "Opportunities",
  requests: "Requests",
  review: "Review queue",
  pm: "Preventative",
  reelnotes: "ReelNotes",
};

// Named sub-pages. Anything else after a section is an id (a profile, a
// playbook, a channel), named by what the section holds.
const SUBPAGES: Record<string, string> = {
  "directory/teams": "Team page",
  "docs/new": "New playbook",
  "contacts/new": "New contact",
  "slack-archive/search": "Search",
  "slack-archive/album": "Photo Album",
  "slack-archive/exceptions": "Exceptions",
  "teams/registrations": "Registrations",
  "teams/import": "Import roster",
  "events/new": "New event",
  "tasks/new": "New task",
  "tasks/deleted": "Deleted",
  "pm/calendar": "Calendar",
  "pm/templates": "Templates",
};

const ITEM_NAMES: Record<string, string> = {
  directory: "Profile",
  contacts: "Contact",
  docs: "Playbook",
  "slack-archive": "Channel",
  events: "Event",
  tasks: "Task",
  pm: "Item",
  requests: "Request",
};

// Last segments that name an action on the item.
const TAILS: Record<string, string> = { edit: "Edit", history: "History" };

// Query keys worth showing ("Search: smith"); others are noise.
const SHOWN_QUERY: Record<string, string> = { q: "Search", team: "Team", tab: "Tab" };

export interface PathParts {
  section: string;
  page?: string;
  detail?: string;
}

export function describePath(path: string): PathParts {
  const [pathname, query = ""] = path.split("?");
  if (!pathname.startsWith("/portal")) return { section: pathname || "—" };
  const segs = pathname.replace(/^\/portal\/?/, "").split("/").filter(Boolean);
  const head = segs[0] ?? "";
  const section = SECTIONS[head] ?? head;

  let page: string | undefined;
  if (segs.length >= 2) {
    page = SUBPAGES[`${head}/${segs[1]}`] ?? ITEM_NAMES[head] ?? segs[1];
    const tail = segs[segs.length - 1];
    if (segs.length >= 3 && TAILS[tail]) page = `${page} · ${TAILS[tail]}`;
  }

  const params = new URLSearchParams(query);
  const bits: string[] = [];
  for (const [key, label] of Object.entries(SHOWN_QUERY)) {
    const v = params.get(key);
    if (v) bits.push(`${label}: ${v.length > 40 ? v.slice(0, 40) + "…" : v}`);
  }
  return { section, page, detail: bits.length ? bits.join(" · ") : undefined };
}

export function pathLabel(path: string): string {
  const p = describePath(path);
  return [p.section, p.page, p.detail].filter(Boolean).join(" · ");
}

// "45s", "12m", "1h 5m", "3d 2h".
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

// "just now", "5 minutes ago", "yesterday", "3 weeks ago".
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [31557600, "month"],
    [Infinity, "year"],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let size = 1;
  for (const [limit, u] of steps) {
    unit = u;
    if (abs < limit) break;
    size = limit;
  }
  return rtf.format(Math.round(diff / size), unit);
}

// "Safari · iPhone", "Chrome · Windows". Rough on purpose.
export function parseUserAgent(ua: string | null | undefined): string {
  if (!ua) return "—";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
    ? "iPad"
    : /Android/.test(ua)
    ? "Android"
    : /Mac OS X|Macintosh/.test(ua)
    ? "Mac"
    : /Windows/.test(ua)
    ? "Windows"
    : /CrOS/.test(ua)
    ? "Chromebook"
    : /Linux/.test(ua)
    ? "Linux"
    : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
    ? "Opera"
    : /Firefox\/|FxiOS/.test(ua)
    ? "Firefox"
    : /Chrome\/|CriOS/.test(ua)
    ? "Chrome"
    : /Safari\//.test(ua)
    ? "Safari"
    : "";
  return [browser, os].filter(Boolean).join(" · ") || "Other";
}

// Times on the Activity page are shown in the club's time zone, so the server
// and the browser print the same thing.
const CLUB_TZ = "America/Chicago";

// "Sep 3, 4:15 PM".
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: CLUB_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// "4:15:07 PM".
export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: CLUB_TZ,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// The last `n` days, oldest first, as "YYYY-MM-DD" in the club's time zone.
export function lastDays(n: number, now = Date.now()): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: CLUB_TZ }).format(new Date(now));
  const [y, m, d] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}

// "Sep 3" for a "YYYY-MM-DD" day, with no time-zone drift.
export function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

export const ROLE_LABELS: Record<string, string> = {
  member: "Member",
  admin: "Board",
  super_admin: "Super-admin",
};
