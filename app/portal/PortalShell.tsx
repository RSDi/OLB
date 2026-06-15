"use client";
// Client shell wrapping every portal route.
//
// Owns UI-only state (collapse + mobile drawer + global search modal) and
// computes the topbar label from the current pathname. Auth/viewer data is
// fetched once in the parent server `layout.tsx` and passed in via props
// so the sidebar can render without its own client-side Supabase round
// trip.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { PortalSidebar, type SidebarViewer } from "../components/PortalSidebar";
import { PortalTopBar } from "../components/PortalTopBar";
import { GlobalSearch } from "../components/GlobalSearch";
import { InfoPanel } from "../components/InfoPanel";
import { pageDocFor } from "../../lib/help/page-docs";
import type { TopbarSearchHandle } from "../components/TopbarSearch";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/portal":             { title: "Dashboard",    subtitle: "Overview" },
  "/portal/requests": { title: "Make a Request", subtitle: "Portal" },
  "/portal/review": { title: "Review queue", subtitle: "Building committee" },
  "/portal/tasks": { title: "Opportunities",  subtitle: "Portal" },
  "/portal/tasks/new": { title: "New task", subtitle: "Portal" },
  "/portal/events/new": { title: "New event", subtitle: "Calendar" },
  "/portal/pm":           { title: "Preventative", subtitle: "Facilities" },
  "/portal/pm/calendar":  { title: "PM Calendar", subtitle: "Facilities" },
  "/portal/pm/templates": { title: "PM Templates", subtitle: "Facilities" },
  "/portal/pm/templates/new": { title: "New template", subtitle: "Facilities" },
  "/portal/events":      { title: "Events",       subtitle: "Calendar" },
  "/portal/directory":              { title: "Directory",     subtitle: "Community" },
  "/portal/directory/households":   { title: "Households",    subtitle: "Directory" },
  "/portal/directory/all":          { title: "All members",   subtitle: "Directory" },
  "/portal/directory/birthdays":    { title: "Birthdays",     subtitle: "Directory" },
  "/portal/directory/anniversaries":{ title: "Anniversaries", subtitle: "Directory" },
  "/portal/directory/phones":       { title: "Phone tree",    subtitle: "Directory" },
  "/portal/directory/extended":     { title: "Extended family", subtitle: "Directory" },
  "/portal/directory/memorials":    { title: "Asleep in Jesus", subtitle: "Directory" },
  "/portal/docs":        { title: "Playbooks",    subtitle: "Operations" },
  "/portal/docs/new":    { title: "New playbook", subtitle: "Operations" },
  "/portal/settings":    { title: "Settings",     subtitle: "Admin" },
};

interface Props {
  viewer: SidebarViewer | null;
  pendingMembersCount: number;
  children: React.ReactNode;
}

export function PortalShell({ viewer, pendingMembersCount, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const inlineSearchRef = useRef<TopbarSearchHandle>(null);
  const pathname = usePathname();
  const pageDoc = pageDocFor(pathname);

  // Cmd+K / Ctrl+K behavior depends on viewport: focus the inline topbar
  // input if it's mounted (large viewports), otherwise toggle the modal
  // (small + medium). We always intercept early so the shortcut works from
  // any input on the page.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (inlineSearchRef.current) {
          inlineSearchRef.current.focus();
        } else {
          setSearchOpen(v => !v);
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  // Exact match first; otherwise label individual ticket detail pages
  // (`/portal/tasks/<id>`, but not /new) as "Request".
  const meta =
    PAGE_META[pathname] ??
    (pathname.startsWith("/portal/requests/")
      ? { title: "New request", subtitle: "Portal" }
      : pathname.startsWith("/portal/tasks/") && pathname !== "/portal/tasks/new"
      ? { title: "Task", subtitle: "Portal" }
      : pathname.startsWith("/portal/pm/templates/")
      ? { title: "Edit template", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/assets/")
      ? { title: "Asset", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/")
      ? { title: "PM Task", subtitle: "Facilities" }
      : pathname.startsWith("/portal/events/")
      ? { title: "Edit event", subtitle: "Calendar" }
      : pathname.startsWith("/portal/directory/")
      ? { title: "Member", subtitle: "Community" }
      : pathname.endsWith("/history") && pathname.startsWith("/portal/docs/")
      ? { title: "History", subtitle: "Operations" }
      : pathname.startsWith("/portal/docs/")
      ? { title: "Playbook", subtitle: "Operations" }
      : { title: "Portal", subtitle: "" });

  return (
    <div className={`rsd-app${collapsed ? " sidebar-collapsed" : ""}`}>
      <PortalSidebar
        viewer={viewer}
        pendingMembersCount={pendingMembersCount}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(v => !v)}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />
      <PortalTopBar
        title={meta.title}
        subtitle={meta.subtitle}
        onMenuClick={() => setMobileOpen(v => !v)}
        onSearchClick={() => setSearchOpen(true)}
        inlineSearchRef={inlineSearchRef}
        onInfoClick={pageDoc ? () => setInfoOpen(true) : undefined}
      />
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 1100,
            background: "rgba(0,0,0,.4)",
            animation: "gw-fade-in 160ms ease",
          }}
        />
      )}
      <main>{children}</main>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <InfoPanel doc={pageDoc} open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
