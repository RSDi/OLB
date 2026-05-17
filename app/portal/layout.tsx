"use client";
import { useState } from "react";
import { PortalSidebar } from "../components/PortalSidebar";
import { PortalTopBar } from "../components/PortalTopBar";
import { usePathname } from "next/navigation";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/portal":             { title: "Dashboard",    subtitle: "Overview" },
  "/portal/maintenance": { title: "Maintenance",  subtitle: "Facilities" },
  "/portal/events":      { title: "Events",       subtitle: "Calendar" },
  "/portal/docs":        { title: "Playbooks",    subtitle: "Operations" },
  "/portal/settings":    { title: "Settings",     subtitle: "Admin" },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const meta = PAGE_META[pathname] ?? { title: "Portal", subtitle: "" };

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
