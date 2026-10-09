"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "./icons";
import { createClient } from "../../lib/supabase/client";
import type { MemberRole, MemberStatus } from "../../lib/auth/permissions";
import { sidebarFrameHref, sidebarLinkMode, type SidebarLink } from "../../lib/sidebar-links/url";
import { PREVIEW_EXIT_PATH } from "../../lib/activity/preview-cookie";
import { recordSignOut } from "./ActivityBeacon";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  staffOnly?: boolean;
  superAdminOnly?: boolean;
  // Any approved member (plus super admins) — hidden from pending/denied accounts.
  approvedOnly?: boolean;
  // Staged rollout: only shown to accounts in lib/auth/feature-preview.ts.
  previewOnly?: boolean;
  // Payments: finance managers, and parents once their balance is open.
  paymentsOnly?: boolean;
  // The HS Schedule: the board and the coaches (a leadership volunteer role
  // on a team), and the travel coordinator, who only looks.
  scheduleOnly?: boolean;
  // External Contacts: the board, the coaches and the travel coordinator.
  contactsOnly?: boolean;
  // Guided-tour anchor (lib/help/tours.ts).
  tour?: string;
}

// Slimmed nav (2026-06): "Make a Request" lives on the Dashboard; Review + PM
// are tabs on Tasks & Projects; Contacts is linked from Directory. Settings is
// staff-only (Board + Super Admin). ReelNotes is no longer a
// top-level item — it lives under Settings → Integrations.
const NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: <Icons.LayoutDashboard width={16} height={16}/>, exact: true, previewOnly: true },
  { href: "/portal/events", label: "Planning", icon: <Icons.Calendar width={16} height={16}/>, previewOnly: true },
  { href: "/portal/tasks", label: "Opportunities", icon: <Icons.CheckCircle width={16} height={16}/>, previewOnly: true },
  { href: "/portal/directory", label: "Directory", icon: <Icons.Users width={16} height={16}/>, tour: "nav-directory" },
  // The high school season weekend by weekend, for coaches and the board,
  // and the travel coordinator to look at (lib/hs-schedule/access.ts).
  { href: "/portal/schedule", label: "HS Schedule", icon: <Icons.Ball width={16} height={16}/>, scheduleOnly: true, tour: "nav-schedule" },
  // Vendors, rented facilities, opposing programs. The board sees them all;
  // coaches read the types shared with them (Settings → Contact Types), and
  // the travel coordinator keeps the hotels and places to eat.
  { href: "/portal/contacts", label: "External Contacts", icon: <Icons.Briefcase width={16} height={16}/>, contactsOnly: true, tour: "nav-contacts" },
  { href: "/portal/docs", label: "Playbooks", icon: <Icons.BookOpen width={16} height={16}/>, tour: "nav-playbooks" },
  // Every family's balance for the Treasurer (the Payments grant); a parent's
  // own balance once the Treasurer turns that on.
  { href: "/portal/payments", label: "Payments", icon: <Icons.Give width={16} height={16}/>, paymentsOnly: true, tour: "nav-payments" },
  // Board can view Settings; editing is gated per grant inside.
  // Pinned to the bottom of the nav (BOTTOM_HREFS).
  { href: "/portal/settings", label: "Settings", icon: <Icons.Cog width={16} height={16}/>, staffOnly: true, tour: "nav-settings" },
  // Slack Channel Archive: siloed feature, super-admin-only for now.
  { href: "/portal/slack-archive", label: "Slack Archive", icon: <Icons.MessageSquare width={16} height={16}/>, approvedOnly: true, tour: "nav-slack-archive" },
  // How-to for everything above; content in lib/help/guide.ts. Pinned to the
  // bottom of the nav, above Settings (BOTTOM_HREFS).
  { href: "/portal/guide", label: "User Guide", icon: <Icons.Info width={16} height={16}/>, tour: "nav-guide" },
];

// Pinned to the bottom of the nav, below the custom links, in this order.
const SETTINGS_HREF = "/portal/settings";
const BOTTOM_HREFS = ["/portal/guide", SETTINGS_HREF];

// Wordmark in the sidebar's brand block (Lightning theme).
const BRAND = { name: "OLB", tagline: "MEMBER PORTAL" };

// Trimmed viewer shape — sidebar only needs role/status to decide which nav
// items to show. Layout fetches the full viewer once per request and hands
// us this slice so we don't fire a duplicate Supabase query post-hydration.
export interface SidebarViewer {
  role: MemberRole;
  status: MemberStatus;
  isStaff: boolean;
  seesFullUi: boolean;
  // The Payments grant (0101): every family's balance.
  canManageFinances?: boolean;
  // The Registrations grant (0102): the registrations queue and team placement.
  canManageRegistrations?: boolean;
  // Shows the Payments item: a finance manager, or a parent whose balance is open.
  seesPayments?: boolean;
  // A coach (a leadership volunteer role on a team): sees the HS Schedule and
  // External Contacts. Only looked up for approved members off the board.
  isCoach?: boolean;
  // The Travel grant (0110): keeps the hotels and places to eat in External
  // Contacts.
  canManageTravel?: boolean;
  // The Slack DMs grant (0118): for the guide's Slack DMs section.
  canSlackDm?: boolean;
  // The Website grant (0120): for the guide's Settings: Website section.
  canManageWebsite?: boolean;
  // Board, or holds a permission whose page is in Settings (0123): sees the
  // Settings item, and the pending badge when they can approve.
  canOpenSettings?: boolean;
  // The External Contacts and Plan HS Schedule permissions (0123), on top of
  // the board, coaches and the travel coordinator.
  canEditContacts?: boolean;
  canPlanHsSchedule?: boolean;
  // Every permission key they hold (0122), for the guide.
  permissions?: string[];
}

interface PortalSidebarProps {
  viewer: SidebarViewer | null;
  pendingMembersCount: number;
  // Custom links from Settings → Sidebar Links, shown under the nav.
  links: SidebarLink[];
  // A super-admin's "Preview as" is in progress: Sign out ends it instead.
  previewing?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

export function PortalSidebar({
  viewer,
  pendingMembersCount,
  links,
  previewing = false,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onNavigate,
}: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const isStaff = viewer?.isStaff ?? false;
  // Settings (incl. the member-approval queue) is super-admin only for now, so
  // the pending badge rides Settings visibility.
  const isSuperAdmin = viewer?.role === "super_admin";
  const isApproved = isSuperAdmin || viewer?.status === "approved";
  const pendingCount = pendingMembersCount;
  const fullUi = viewer?.seesFullUi ?? false;

  // Members (non-staff) get the request page as their "Dashboard"; staff keep
  // the KPI overview at /portal.
  const navItems: NavItem[] = NAV.map((item) =>
    item.href === "/portal" && !isStaff
      ? { ...item, href: "/portal/requests", exact: false }
      : item
  );

  const seesPayments = viewer?.seesPayments ?? false;
  const isCoach = viewer?.isCoach ?? false;
  const travel = viewer?.canManageTravel ?? false;
  const settings = isStaff || !!viewer?.canOpenSettings;
  const planner = isStaff || isCoach || travel || !!viewer?.canPlanHsSchedule;
  const contacts = isStaff || isCoach || travel || !!viewer?.canEditContacts;
  const visibleItems = navItems.filter(item => (!item.staffOnly || settings) && (!item.superAdminOnly || isSuperAdmin) && (!item.approvedOnly || isApproved) && (!item.previewOnly || fullUi) && (!item.paymentsOnly || seesPayments) && (!item.scheduleOnly || planner) && (!item.contactsOnly || contacts));
  const mainItems = visibleItems.filter(item => !BOTTOM_HREFS.includes(item.href));
  const bottomItems = BOTTOM_HREFS
    .map(href => visibleItems.find(item => item.href === href))
    .filter((item): item is NavItem => !!item);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const c = isMobile ? false : collapsed;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    flexDirection: c ? "column" : "row",
    alignItems: "center",
    justifyContent: c ? "center" : "flex-start",
    gap: c ? 3 : (isMobile ? 14 : 10),
    padding: c ? "7px 2px" : (isMobile ? "14px 14px" : "9px 10px"),
    borderRadius: isMobile ? 10 : 9,
    // Inactive items leave background unset so the hover rule in
    // globals.css (.rsd-nav-item) can apply.
    background: active ? "var(--rsd-accent)" : undefined,
    color: active ? "var(--rsd-accent-on)" : "var(--rsd-frame-fg-2)",
    border: "1px solid",
    borderColor: active ? "var(--rsd-accent)" : "transparent",
    fontWeight: 700, fontSize: isMobile ? 15 : 13, lineHeight: 1,
    textDecoration: "none",
    transition: "background 150ms",
    position: "relative",
    minHeight: isMobile ? 48 : undefined,
  });

  const iconStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", flexShrink: 0,
    color: active ? "var(--rsd-accent-on)" : "var(--rsd-frame-fg-3)",
    position: "relative",
    transform: isMobile ? "scale(1.15)" : undefined, transformOrigin: "center",
  });

  // Two-word labels ("Slack Archive", "User Guide") wrap in the narrow
  // column, so center each line, not just the block.
  const collapsedLabelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: ".04em", opacity: 0.75, textAlign: "center", lineHeight: 1.15, maxWidth: "100%" };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.href, item.exact);
    const isSettings = item.href === SETTINGS_HREF;
    // No prefetch: every portal page is dynamic, so a prefetch only
    // fetched the route's shape — but it still cost a request (and a
    // Supabase auth check in middleware) per nav item on every page view.
    return (
      <Link
        key={item.href}
        href={item.href}
        prefetch={false}
        aria-current={active ? "page" : undefined}
        data-tour={item.tour}
        className="gw-press rsd-nav-item"
        onClick={() => { if (isMobile) onNavigate?.(); }}
        style={itemStyle(active)}
      >
        <span style={iconStyle(active)}>
          {item.icon}
          {isSettings && pendingCount > 0 && (
            <span style={{
              position: "absolute", top: -4, right: -4,
              width: 14, height: 14, borderRadius: "50%",
              background: "var(--rsd-error-fill)", color: "#fff",
              fontSize: 9, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}>
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          )}
        </span>
        {c ? (
          <span style={collapsedLabelStyle}>
            {item.label}
          </span>
        ) : (
          <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {item.label}
            {isSettings && pendingCount > 0 && !c && (
              <span style={{
                background: "var(--rsd-error-fill)", color: "#fff",
                fontSize: 10, fontWeight: 800, borderRadius: 100,
                padding: "2px 6px", lineHeight: 1.4,
              }}>
                {pendingCount}
              </span>
            )}
          </span>
        )}
      </Link>
    );
  };

  async function handleSignOut() {
    // During a "Preview as", signing out ends the preview on the server —
    // a normal sign-out here would sign the member out of all their devices.
    if (previewing) {
      window.location.assign(`${PREVIEW_EXIT_PATH}?reason=logout`);
      return;
    }
    await recordSignOut();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className={`rsd-sidebar${mobileOpen ? " rsd-mob-open" : ""}`} style={{
      background: "var(--rsd-frame)",
      borderRight: "1px solid var(--rsd-frame-line)",
      padding: c ? "20px 8px" : "20px 14px",
      display: "flex", flexDirection: "column", gap: 14,
      color: "var(--rsd-frame-fg-2)",
      transition: "padding 200ms var(--gw-ease)",
    }}>
      {/* Brand */}
      <Link href="/" aria-label={`${BRAND.name} home`} style={{
        display: "flex", gap: 10, alignItems: "center",
        justifyContent: c ? "center" : "flex-start",
        padding: c ? "8px 0" : "10px 12px",
        border: "1px solid var(--rsd-frame-line)",
        borderRadius: 12, background: "var(--rsd-frame-2)",
        textDecoration: "none",
        flexShrink: 0,
      }}>
        {/* The club's bolt logo on gold, the same as the site's icon. */}
        <Image
          src="/email/olb-bolt.png"
          alt=""
          width={34}
          height={34}
          style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 9, display: "block" }}
        />
        {!c && (
          <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{
              fontFamily: "var(--rsd-display)", fontWeight: 800,
              fontSize: "calc(15px * var(--rsd-display-scale))", lineHeight: 1,
              letterSpacing: ".02em", textTransform: "uppercase", color: "var(--rsd-frame-fg)",
            }}>
              {BRAND.name}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--rsd-frame-fg-3)", lineHeight: 1, letterSpacing: ".08em" }}>{BRAND.tagline}</div>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav data-tour="sidebar-nav" style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {mainItems.map(renderNavItem)}

        {links.length > 0 && (
          <>
            <div role="separator" style={{ height: 1, background: "var(--rsd-frame-line)", margin: "8px 4px" }} />
            <div data-tour="sidebar-links" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {links.map(link => {
                // Portal paths opened in the same tab, and outside sites opened
                // inside the portal (/portal/links/<id>), behave like the items
                // above; everything else is a plain link, in a new tab unless
                // turned off.
                const mode = sidebarLinkMode(link);
                const href = mode === "frame" ? sidebarFrameHref(link.id) : link.url;
                const internal = mode === "frame" || (link.url.startsWith("/") && mode === "same_tab");
                const active = internal && isActive(href);
                const body = (
                  <>
                    <span style={iconStyle(active)}>
                      {mode === "new_tab"
                        ? <Icons.ExternalLink width={16} height={16}/>
                        : <Icons.Link width={16} height={16}/>}
                    </span>
                    {c ? (
                      <span style={collapsedLabelStyle}>{link.label}</span>
                    ) : (
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
                        {link.label}
                      </span>
                    )}
                  </>
                );
                const onClick = () => { if (isMobile) onNavigate?.(); };
                return internal ? (
                  <Link
                    key={link.id}
                    href={href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className="gw-press rsd-nav-item"
                    onClick={onClick}
                    style={itemStyle(active)}
                  >
                    {body}
                  </Link>
                ) : (
                  <a
                    key={link.id}
                    href={link.url}
                    target={link.open_in_new_tab ? "_blank" : undefined}
                    rel={link.open_in_new_tab ? "noopener noreferrer" : undefined}
                    title={link.open_in_new_tab ? `${link.label} (opens in a new tab)` : undefined}
                    className="gw-press rsd-nav-item"
                    onClick={onClick}
                    style={itemStyle(false)}
                  >
                    {body}
                  </a>
                );
              })}
            </div>
          </>
        )}

        {/* User Guide and Settings sit at the bottom, just above Collapse / Sign out. */}
        {bottomItems.length > 0 && (
          <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", flexDirection: "column", gap: 1 }}>
            {bottomItems.map(renderNavItem)}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            data-tour="sidebar-collapse"
            className="gw-press"
            title={c ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: c ? "center" : "flex-start",
              gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%",
              background: "var(--rsd-frame-2)", border: "1px solid var(--rsd-frame-line)",
              color: "var(--rsd-frame-fg-2)", fontWeight: 700, fontSize: 13,
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}>
              {c ? <Icons.ChevronsRight width={16} height={16}/> : <Icons.ChevronsLeft width={16} height={16}/>}
            </span>
            {!c && "Collapse"}
          </button>
        )}
        <button
          onClick={handleSignOut}
          style={{
            display: "flex", alignItems: "center", justifyContent: c ? "center" : "flex-start",
            gap: isMobile ? 14 : 10,
            padding: isMobile ? "14px 14px" : "10px 12px",
            borderRadius: 10, width: "100%",
            color: "var(--rsd-frame-fg-3)", fontWeight: 700,
            fontSize: isMobile ? 15 : 13,
            minHeight: isMobile ? 48 : undefined,
            background: "none", border: "none", cursor: "pointer", transition: "color 150ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--gw-error)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--rsd-frame-fg-3)")}
        >
          <span style={{ display: "flex", transform: isMobile ? "scale(1.15)" : undefined }}>
            <Icons.LogOut width={16} height={16}/>
          </span>
          {!c && "Sign out"}
        </button>
      </div>
    </aside>
  );
}
