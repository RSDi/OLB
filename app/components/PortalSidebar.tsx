"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "./icons";
import { createClient } from "../../lib/supabase/client";
import type { MemberRole, MemberStatus } from "../../lib/auth/permissions";

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
}

// Slimmed nav (2026-06): "Make a Request" lives on the Dashboard; Review + PM
// are tabs on Tasks & Projects; Contacts is linked from Directory. Settings is
// staff-only (Building Committee + Super Admin). ReelNotes is no longer a
// top-level item — it lives under Settings → Integrations.
const NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: <Icons.LayoutDashboard width={16} height={16}/>, exact: true, previewOnly: true },
  { href: "/portal/events", label: "Events", icon: <Icons.Calendar width={16} height={16}/>, previewOnly: true },
  { href: "/portal/tasks", label: "Opportunities", icon: <Icons.CheckCircle width={16} height={16}/>, previewOnly: true },
  { href: "/portal/directory", label: "Directory", icon: <Icons.Users width={16} height={16}/> },
  // Vendors, rented facilities, opposing programs. The page itself is
  // staff-only, so the link is too.
  { href: "/portal/contacts", label: "External Contacts", icon: <Icons.Briefcase width={16} height={16}/>, staffOnly: true },
  { href: "/portal/docs", label: "Playbooks", icon: <Icons.BookOpen width={16} height={16}/> },
  // Team manager (roster board, registrations, import): super-admin only.
  { href: "/portal/teams", label: "Teams", icon: <Icons.Shield width={16} height={16}/>, superAdminOnly: true, previewOnly: true },
  // Building Committee can view Settings; editing is gated per grant inside.
  { href: "/portal/settings", label: "Settings", icon: <Icons.Cog width={16} height={16}/>, staffOnly: true },
  // Slack Channel Archive: siloed feature, super-admin-only for now.
  { href: "/portal/slack-archive", label: "Slack Archive", icon: <Icons.MessageSquare width={16} height={16}/>, approvedOnly: true },
];

// Wordmark in the sidebar's brand block (Lightning theme).
const BRAND = { name: "OLB", tagline: "MEMBER PORTAL" };

// Filled lightning bolt for the brand tile. Icons in ./icons are stroke-only.
function BoltMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 2 5 13.5h6L10 22l9-11.5h-6L14 2z" fill="currentColor" />
    </svg>
  );
}

// Trimmed viewer shape — sidebar only needs role/status to decide which nav
// items to show. Layout fetches the full viewer once per request and hands
// us this slice so we don't fire a duplicate Supabase query post-hydration.
export interface SidebarViewer {
  role: MemberRole;
  status: MemberStatus;
  isStaff: boolean;
  seesFullUi: boolean;
}

interface PortalSidebarProps {
  viewer: SidebarViewer | null;
  pendingMembersCount: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

export function PortalSidebar({
  viewer,
  pendingMembersCount,
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

  async function handleSignOut() {
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
        <span style={{
          width: 34, height: 34, flexShrink: 0, borderRadius: 9,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
        }}>
          <BoltMark />
        </span>
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
      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {navItems.filter(item => (!item.staffOnly || isStaff) && (!item.superAdminOnly || isSuperAdmin) && (!item.approvedOnly || isApproved) && (!item.previewOnly || fullUi)).map(item => {
          const active = isActive(item.href, item.exact);
          const isSettings = item.href === "/portal/settings";
          // No prefetch: every portal page is dynamic, so a prefetch only
          // fetched the route's shape — but it still cost a request (and a
          // Supabase auth check in middleware) per nav item on every page view.
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              aria-current={active ? "page" : undefined}
              className="gw-press rsd-nav-item"
              onClick={() => { if (isMobile) onNavigate?.(); }}
              style={{
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
              }}
            >
              <span style={{ display: "flex", flexShrink: 0, color: active ? "var(--rsd-accent-on)" : "var(--rsd-frame-fg-3)", position: "relative", transform: isMobile ? "scale(1.15)" : undefined, transformOrigin: "center" }}>
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
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", opacity: 0.75 }}>
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
        })}
      </nav>

      {/* Bottom */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
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
