"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";
import {
  canApproveMembers,
  canEditSettings,
  canManageSiteLinks,
  canManageTeams,
  canManageRegistrations,
  canManageWebsite,
  canOpenSettings,
  isStaff,
  isSuperAdmin,
  type MemberLike,
} from "../../../lib/auth/permissions";
import { seesFullUi } from "../../../lib/auth/feature-preview";
import { loadGrants } from "../../../lib/auth/load-grants";
import { MembersTab } from "./MembersTab";
import { AreasTab } from "./AreasTab";
import { PrioritiesTab } from "./PrioritiesTab";
import { AssetsTab } from "./AssetsTab";
import { TypesTab } from "./TypesTab";
import { SuppliesTab } from "./SuppliesTab";
import { TeamsSettingsTab } from "./TeamsSettingsTab";
import { VolunteerRolesTab } from "./VolunteerRolesTab";
import { EventCategoriesTab } from "./EventCategoriesTab";
import { TaskCategoriesTab } from "./TaskCategoriesTab";
import { PlaybooksTab } from "./PlaybooksTab";
import { ContactCategoriesTab } from "./ContactCategoriesTab";
import { AuditLogTab } from "./AuditLogTab";
import { DeletedTab } from "./DeletedTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { ImportTab } from "./ImportTab";
import { SidebarLinksTab } from "./SidebarLinksTab";
import { RequirementsTab } from "./RequirementsTab";
import { EmailTemplatesTab } from "./EmailTemplatesTab";
import { RegistrationEmailsTab } from "./RegistrationEmailsTab";
import { PlanningRolesTab } from "./PlanningRolesTab";
import { PublicDirectoryTab } from "./PublicDirectoryTab";
import { WebsiteTab } from "./WebsiteTab";
import { AccessProfilesTab } from "./AccessProfilesTab";
import { usePageHelp } from "../../components/PageHelp";
import { Icons } from "../../components/icons";

// Staged rollout: the tabs released to everyone who can open Settings, and
// the extra ones released to super-admins only. The rest stay with the
// accounts in lib/auth/feature-preview.ts.
// Website is released to whoever holds its grant (and super-admins).
const RELEASED_TABS = new Set<string>(["members", "teams", "volunteer_roles", "requirements", "email_templates", "registration_emails", "website"]);
const SUPER_ADMIN_RELEASED_TABS = new Set<string>([
  "access_profiles",
  "playbooks",
  "sidebar_links",
  "public_directory",
  "contact_categories",
  "audit_log",
]);

// The User Guide section for each tab, so the top-bar "i" (and its "Show me
// around") match the open tab. Tabs without one fall back to Members.
const TAB_HELP: Partial<Record<Tab, string>> = {
  members: "settings-members",
  access_profiles: "settings-access-profiles",
  teams: "settings-teams",
  volunteer_roles: "settings-volunteer-roles",
  requirements: "settings-requirements",
  email_templates: "settings-email-templates",
  registration_emails: "settings-registration-emails",
  website: "settings-website",
  playbooks: "settings-playbooks",
  sidebar_links: "settings-sidebar-links",
  public_directory: "settings-public-directory",
  contact_categories: "settings-contact-types",
  audit_log: "settings-audit-log",
};

type Tab =
  | "members"
  | "access_profiles"
  | "areas"
  | "priorities"
  | "assets"
  | "types"
  | "supplies"
  | "teams"
  | "volunteer_roles"
  | "requirements"
  | "email_templates"
  | "registration_emails"
  | "website"
  | "planning_roles"
  | "event_categories"
  | "task_categories"
  | "playbooks"
  | "sidebar_links"
  | "public_directory"
  | "contact_categories"
  | "integrations"
  | "import"
  | "audit_log"
  | "deleted";

// The groups the side menu sorts the tabs into, in order.
const GROUPS = [
  "People & Access",
  "Facilities & Equipment",
  "Work & Events",
  "Communication",
  "Website & Portal",
  "System",
] as const;
type Group = (typeof GROUPS)[number];

type TabDef = {
  key: Tab;
  label: string;
  group: Group;
  visible: boolean;
  // The tab button's guided-tour anchor (lib/help/tours.ts).
  tour: string;
  // Extra words the menu's filter box matches, beyond the label and group.
  keywords: string;
};

// Every tab this person can open, in menu order. Shared by the first-load
// pick (a `?tab=` link) and the menu itself.
function visibleTabs(me: MemberLike, fullUi: boolean): TabDef[] {
  // Any board member works the approval queue, and so does anyone with the
  // Approve access requests permission (0123); role/edit/remove inside the
  // tab stay super-admin-only via canManage.
  const showMembers = canApproveMembers(me);
  const teams = canManageTeams(me);
  const siteLinks = canManageSiteLinks(me);
  // Someone off the board who holds one of the permissions above sees only
  // those tabs; the rest of Settings is the board's.
  const board = isStaff(me);
  const GRANTED_TABS: Partial<Record<Tab, boolean>> = {
    members: showMembers,
    teams,
    volunteer_roles: teams,
    sidebar_links: siteLinks,
    public_directory: siteLinks,
    registration_emails: canManageRegistrations(me),
  };
  // Deleted tab stays super-admin-only until the RLS follow-up lets board
  // members with the undelete grant see + restore soft-deleted rows.
  const showDeleted = isSuperAdmin(me);

  const tabs: TabDef[] = [
    { key: "members", label: "Members", group: "People & Access", visible: showMembers, tour: "settings-tab-members", keywords: "approve deny pending access requests people accounts users activity usage sign-ins sessions last seen preview as" },
    // Named bundles of permissions handed out in Members (0122).
    { key: "access_profiles", label: "Access Profiles", group: "People & Access", visible: isSuperAdmin(me), tour: "settings-tab-access-profiles", keywords: "permissions roles grants treasurer" },
    { key: "teams", label: "Teams", group: "People & Access", visible: teams, tour: "settings-tab-teams", keywords: "coaches roster squads" },
    { key: "volunteer_roles", label: "Volunteer Roles", group: "People & Access", visible: teams, tour: "settings-tab-volunteer-roles", keywords: "volunteers parents jobs" },
    { key: "requirements", label: "Requirements", group: "People & Access", visible: canEditSettings(me), tour: "settings-tab-requirements", keywords: "forms fees players registration hand in pay" },
    // Planning (lib/planning/access.ts): staged rollout, so only the preview
    // accounts get the tab until Planning is released.
    { key: "planning_roles", label: "Planning Roles", group: "People & Access", visible: fullUi, tour: "settings-tab-planning-roles", keywords: "planning" },
    { key: "areas", label: "Areas", group: "Facilities & Equipment", visible: true, tour: "settings-tab-areas", keywords: "fields rooms locations places" },
    { key: "assets", label: "Assets", group: "Facilities & Equipment", visible: true, tour: "settings-tab-assets", keywords: "equipment items" },
    { key: "types", label: "Types", group: "Facilities & Equipment", visible: true, tour: "settings-tab-types", keywords: "asset types kinds categories" },
    { key: "supplies", label: "Supplies", group: "Facilities & Equipment", visible: true, tour: "settings-tab-supplies", keywords: "stock inventory" },
    { key: "priorities", label: "Priorities", group: "Work & Events", visible: true, tour: "settings-tab-priorities", keywords: "tasks urgent" },
    { key: "task_categories", label: "Task Categories", group: "Work & Events", visible: true, tour: "settings-tab-task-categories", keywords: "tasks" },
    { key: "event_categories", label: "Event Categories", group: "Work & Events", visible: true, tour: "settings-tab-event-categories", keywords: "calendar events" },
    { key: "playbooks", label: "Playbooks", group: "Work & Events", visible: true, tour: "settings-tab-playbooks", keywords: "checklists procedures steps" },
    // Any board member writes the templates used when emailing families (0117).
    { key: "email_templates", label: "Email Templates", group: "Communication", visible: true, tour: "settings-tab-email-templates", keywords: "email mail messages families" },
    // The words in the registration form's emails (0127): the board reads,
    // super-admins and the Registrations permission change them.
    { key: "registration_emails", label: "Registration Emails", group: "Communication", visible: true, tour: "settings-tab-registration-emails", keywords: "registration receipt code email wording confirmation" },
    { key: "contact_categories", label: "Contact Types", group: "Communication", visible: true, tour: "settings-tab-contact-categories", keywords: "contacts categories" },
    // The public club website's menu, page text and pictures (0120).
    { key: "website", label: "Website", group: "Website & Portal", visible: canManageWebsite(me), tour: "settings-tab-website", keywords: "public site pages pictures publish" },
    { key: "sidebar_links", label: "Sidebar Links", group: "Website & Portal", visible: siteLinks, tour: "settings-tab-sidebar-links", keywords: "links menu" },
    // The key in the public Directory's link (0119).
    { key: "public_directory", label: "Public Directory", group: "Website & Portal", visible: siteLinks, tour: "settings-tab-public-directory", keywords: "directory link key" },
    { key: "integrations", label: "Integrations", group: "System", visible: true, tour: "settings-tab-integrations", keywords: "slack google connect" },
    // The spreadsheet import, kept for the preview accounts only.
    { key: "import", label: "Import", group: "System", visible: fullUi, tour: "settings-tab-import", keywords: "spreadsheet upload csv" },
    { key: "audit_log", label: "Audit Log", group: "System", visible: true, tour: "settings-tab-audit-log", keywords: "history changes who" },
    { key: "deleted", label: "Deleted", group: "System", visible: showDeleted, tour: "settings-tab-deleted", keywords: "restore undelete trash" },
  ];
  return tabs.filter(
    (t) =>
      t.visible &&
      (board || GRANTED_TABS[t.key]) &&
      (fullUi ||
        RELEASED_TABS.has(t.key) ||
        (isSuperAdmin(me) && SUPER_ADMIN_RELEASED_TABS.has(t.key)) ||
        // Granted by permission (0123), so released to whoever holds it.
        GRANTED_TABS[t.key])
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<MemberLike | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("areas");
  usePageHelp(TAB_HELP[tab] ?? null);
  const [authChecked, setAuthChecked] = useState(false);
  const [fullUi, setFullUi] = useState(false);
  const [filter, setFilter] = useState("");
  // The phone's full-screen menu.
  const [sheetOpen, setSheetOpen] = useState(false);

  // While the phone menu is open, the page behind it stays put and Esc
  // closes it.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const [{ data: meRow }, grants] = await Promise.all([
        supabase.from("members").select("role, status").eq("user_id", user.id).maybeSingle(),
        loadGrants(supabase, user.id),
      ]);
      const memberLike = meRow ? ({ ...grants, ...(meRow as MemberLike) } as MemberLike) : null;
      // The board, and anyone holding a permission whose page is here (0123).
      if (!canOpenSettings(memberLike)) {
        router.replace("/portal");
        return;
      }
      const preview = seesFullUi(user.email);
      setMe(memberLike);
      setUserId(user.id);
      setFullUi(preview);
      // A `?tab=` link opens that tab when they have it (the public site's
      // preview bar links to the Website tab to publish). Otherwise all
      // board staff land on Members — any of them can work the approval
      // queue (D1) — and someone off the board lands on the first tab they
      // have.
      const wanted = new URLSearchParams(window.location.search).get("tab");
      const mine = visibleTabs(memberLike!, preview);
      const linked = mine.find((t) => t.key === wanted);
      const landing: Tab = canApproveMembers(memberLike)
        ? "members"
        : canManageTeams(memberLike)
        ? "teams"
        : "sidebar_links";
      setTab(linked ? linked.key : mine.some((t) => t.key === landing) ? landing : mine[0]?.key ?? landing);
      setAuthChecked(true);
    })();
  }, [router]);

  // Opens a tab and puts it in the address bar, so the link can be shared
  // and a reload stays put.
  const openTab = (key: Tab) => {
    setTab(key);
    setFilter("");
    setSheetOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(window.history.state, "", url);
  };

  if (!authChecked || !me || !userId) {
    return (
      <div
        style={{
          padding: "40px 0",
          textAlign: "center",
          color: "var(--gw-fg-muted)",
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  const shownTabs = visibleTabs(me, fullUi);
  const has = (key: Tab) => shownTabs.some((t) => t.key === key);
  const q = filter.trim().toLowerCase();
  const matching = q
    ? shownTabs.filter((t) => `${t.label} ${t.group} ${t.keywords}`.toLowerCase().includes(q))
    : shownTabs;

  const content = (
    <>
      {tab === "members" && has("members") && (
        <MembersTab currentUserId={userId} canManage={isSuperAdmin(me)} showActivity={isSuperAdmin(me) && fullUi} />
      )}
      {tab === "access_profiles" && has("access_profiles") && <AccessProfilesTab />}
      {tab === "areas" && has("areas") && <AreasTab me={me} />}
      {tab === "priorities" && has("priorities") && <PrioritiesTab me={me} />}
      {tab === "assets" && has("assets") && <AssetsTab me={me} />}
      {tab === "types" && has("types") && <TypesTab me={me} />}
      {tab === "supplies" && has("supplies") && <SuppliesTab me={me} />}
      {tab === "teams" && has("teams") && <TeamsSettingsTab />}
      {tab === "volunteer_roles" && has("volunteer_roles") && <VolunteerRolesTab />}
      {tab === "requirements" && has("requirements") && <RequirementsTab me={me} />}
      {tab === "email_templates" && has("email_templates") && <EmailTemplatesTab />}
      {tab === "registration_emails" && has("registration_emails") && <RegistrationEmailsTab canEdit={canManageRegistrations(me)} />}
      {tab === "website" && has("website") && <WebsiteTab />}
      {tab === "planning_roles" && has("planning_roles") && <PlanningRolesTab />}
      {tab === "event_categories" && has("event_categories") && <EventCategoriesTab me={me} />}
      {tab === "task_categories" && has("task_categories") && <TaskCategoriesTab me={me} />}
      {tab === "playbooks" && has("playbooks") && <PlaybooksTab me={me} />}
      {tab === "sidebar_links" && has("sidebar_links") && <SidebarLinksTab />}
      {tab === "public_directory" && has("public_directory") && <PublicDirectoryTab />}
      {tab === "contact_categories" && has("contact_categories") && <ContactCategoriesTab me={me} />}
      {tab === "integrations" && has("integrations") && <IntegrationsTab />}
      {tab === "import" && has("import") && <ImportTab />}
      {tab === "audit_log" && has("audit_log") && <AuditLogTab />}
      {tab === "deleted" && has("deleted") && <DeletedTab />}
    </>
  );

  // Staged rollout: everyone else only gets the released tabs, and no menu
  // at all when that leaves just one.
  if (shownTabs.length <= 1) return content;

  const current = shownTabs.find((t) => t.key === tab);

  // The filter box and the grouped list, shared by the side menu and the
  // phone's full-screen list. `data-tour` sits on both copies; tours point at
  // whichever is showing.
  const menu = (phone: boolean) => (
    <>
      <input
        type="search"
        className="rsd-settings-filter"
        placeholder="Find a setting…"
        aria-label="Find a setting"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setFilter("");
          // Enter opens the only (or first) match.
          if (e.key === "Enter" && matching[0]) openTab(matching[0].key);
        }}
      />
      {matching.length === 0 && <div className="rsd-settings-empty">No settings match “{filter.trim()}”.</div>}
      {GROUPS.map((g) => {
        const items = matching.filter((t) => t.group === g);
        if (items.length === 0) return null;
        return (
          <div key={g} className="rsd-settings-group">
            <div className="rsd-eyebrow rsd-settings-group-label">{g}</div>
            <div className="rsd-settings-items">
              {items.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openTab(t.key)}
                  data-tour={t.tour}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`gw-press rsd-settings-item${tab === t.key ? " is-active" : ""}`}
                >
                  {t.label}
                  {phone && tab === t.key && <Icons.Check width={16} height={16} />}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );

  return (
    <div className="rsd-settings">
      {/* The side menu: the tabs sorted into groups, with a box that
          narrows them by name. Hidden on a phone. */}
      <nav className="rsd-settings-nav" data-tour="settings-tabs" aria-label="Settings">
        {menu(false)}
      </nav>
      {/* Phone: one bar naming the open tab; "Change" opens the menu full
          screen. A tour points at this bar for a tab tucked inside it. */}
      <button
        type="button"
        className="gw-press rsd-settings-picker"
        data-tour="settings-tabs"
        data-tour-stands-in="settings-tab-"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen(true)}
      >
        <span className="rsd-settings-picker-text">
          <span className="rsd-eyebrow">{current?.group}</span>
          <span className="rsd-settings-picker-name">{current?.label ?? "Settings"}</span>
        </span>
        <span className="rsd-settings-picker-change">Change ›</span>
      </button>
      {sheetOpen && (
        <div
          className="rsd-settings-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          data-tour-menu=""
        >
          <div className="rsd-settings-sheet-head">
            <span>Settings</span>
            <button type="button" className="gw-press" data-tour-close="" onClick={() => setSheetOpen(false)}>
              Done
            </button>
          </div>
          <div className="rsd-settings-sheet-body">{menu(true)}</div>
        </div>
      )}
      <div className="rsd-settings-body">{content}</div>
    </div>
  );
}
