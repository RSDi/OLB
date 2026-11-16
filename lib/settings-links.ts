// Links into Settings that bring you back. Any "Settings → Film" the portal
// shows is a link to that tab, carrying `back` (where you were) so Settings
// can offer "← Back". Pure, so it's unit tested.

/** Settings tab label (as the menu shows it) → its `?tab=` key. */
export const SETTINGS_TABS: Record<string, string> = {
  Members: "members",
  "Access Profiles": "access_profiles",
  Teams: "teams",
  Film: "film",
  Season: "season",
  "Volunteer Roles": "volunteer_roles",
  Requirements: "requirements",
  "Planning Roles": "planning_roles",
  Areas: "areas",
  Assets: "assets",
  Types: "types",
  Supplies: "supplies",
  Priorities: "priorities",
  "Task Categories": "task_categories",
  "Event Categories": "event_categories",
  Playbooks: "playbooks",
  "Email Templates": "email_templates",
  "Registration Emails": "registration_emails",
  Messages: "registration_messages",
  "Registration Automations": "registration_automations",
  Assessments: "assessments",
  Uniforms: "uniforms",
  Fees: "fees",
  Invoices: "invoices",
  "Contact Types": "contact_categories",
  Website: "website",
  "Website Activity": "website_activity",
  "Coach Cory !": "cory",
  "Release Notes": "release_notes",
  "Sidebar Links": "sidebar_links",
  "Public Directory": "public_directory",
  Integrations: "integrations",
  Import: "import",
  "Agent keys": "agent_keys",
  "Audit Log": "audit_log",
  Deleted: "deleted",
};

/** Only same-site portal paths may be a "back" target. */
export function safeBackPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/portal/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (raw.startsWith("/portal/settings")) return null;
  return raw;
}

export function settingsHref(tab: string, back?: string | null): string {
  const params = new URLSearchParams({ tab });
  const safe = safeBackPath(back);
  if (safe) params.set("back", safe);
  return `/portal/settings?${params.toString()}`;
}

/** "← Back to Film" for /portal/film?…, "← Back" when the page has no plain name. */
export function backLabel(path: string): string {
  const seg = path.replace(/^\/portal\//, "").split(/[/?#]/)[0] ?? "";
  const names: Record<string, string> = {
    film: "Film",
    directory: "Directory",
    events: "Events",
    tasks: "Tasks",
    payments: "Payments",
    pm: "PM",
    docs: "Playbooks",
    roadmap: "Roadmap",
    stats: "Stats",
  };
  return names[seg] ? `← Back to ${names[seg]}` : "← Back";
}

export type SettingsTextPart = { text: string; tab?: string };

const LABELS_LONGEST_FIRST = Object.keys(SETTINGS_TABS).sort((a, b) => b.length - a.length);
const REF = new RegExp(
  `Settings (?:→|->) (${LABELS_LONGEST_FIRST.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "g"
);

/** Splits a message so each "Settings → <Tab>" can render as a link. */
export function splitSettingsRefs(text: string): SettingsTextPart[] {
  const parts: SettingsTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(REF)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: m[0], tab: SETTINGS_TABS[m[1]] });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
