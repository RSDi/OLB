"use client";
import { useState } from "react";
import { PortalSidebar } from "../components/PortalSidebar";
import { PortalTopBar } from "../components/PortalTopBar";
import { usePathname } from "next/navigation";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/portal":             { title: "Dashboard",    subtitle: "Overview" },
  "/portal/maintenance": { title: "Maintenance",  subtitle: "Facilities" },
  "/portal/maintenance/new": { title: "New request", subtitle: "Facilities" },
  "/portal/events/new": { title: "New event", subtitle: "Calendar" },
  "/portal/pm":           { title: "Preventative", subtitle: "Facilities" },
  "/portal/pm/calendar":  { title: "PM Calendar", subtitle: "Facilities" },
  "/portal/pm/templates": { title: "PM Templates", subtitle: "Facilities" },
  "/portal/pm/templates/new": { title: "New template", subtitle: "Facilities" },
  "/portal/events":      { title: "Events",       subtitle: "Calendar" },
  "/portal/docs":        { title: "Playbooks",    subtitle: "Operations" },
  "/portal/settings":    { title: "Settings",     subtitle: "Admin" },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  // Exact match first; otherwise label individual ticket detail pages
  // (`/portal/maintenance/<id>`, but not /new) as "Request".
  const meta =
    PAGE_META[pathname] ??
    (pathname.startsWith("/portal/maintenance/") && pathname !== "/portal/maintenance/new"
      ? { title: "Request", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/templates/")
      ? { title: "Edit template", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/assets/")
      ? { title: "Asset", subtitle: "Facilities" }
      : pathname.startsWith("/portal/pm/")
      ? { title: "PM Task", subtitle: "Facilities" }
      : pathname.startsWith("/portal/events/")
      ? { title: "Edit event", subtitle: "Calendar" }
      : { title: "Portal", subtitle: "" });

  return (
    <div className={`rsd-app${collapsed ? " sidebar-collapsed" : ""}`}>
      <PortalSidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(v => !v)}
        mobileOpen={mobileOpen}
      />
      <PortalTopBar
        title={meta.title}
        subtitle={meta.subtitle}
        onMenuClick={() => setMobileOpen(v => !v)}
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
    </div>
  );
}
