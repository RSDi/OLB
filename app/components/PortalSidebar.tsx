"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";

const NAV = [
  { href: "/portal", label: "Dashboard", icon: <Icons.LayoutDashboard width={16} height={16}/>, exact: true },
  { href: "/portal/maintenance", label: "Maintenance", icon: <Icons.Wrench width={16} height={16}/> },
  { href: "/portal/events", label: "Events", icon: <Icons.Calendar width={16} height={16}/> },
  { href: "/portal/docs", label: "Playbooks", icon: <Icons.BookOpen width={16} height={16}/> },
  { href: "/portal/settings", label: "Settings", icon: <Icons.Cog width={16} height={16}/> },
];

interface PortalSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
}

export function PortalSidebar({ collapsed, onToggleCollapse, mobileOpen }: PortalSidebarProps) {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);
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

  return (
    <aside className={`rsd-sidebar${mobileOpen ? " rsd-mob-open" : ""}`} style={{
      background: "var(--gw-ink)",
      borderRight: "1px solid var(--gw-stroke-dark)",
      padding: c ? "20px 8px" : "20px 14px",
      display: "flex", flexDirection: "column", gap: 14,
      color: "rgba(255,255,255,.7)",
      transition: "padding 200ms var(--gw-ease)",
    }}>
      {/* Brand */}
      <Link href="/" style={{
        display: "flex", gap: c ? 0 : 10, alignItems: "center",
        justifyContent: c ? "center" : "flex-start",
        padding: c ? "10px 0" : "10px 12px",
        border: "1px solid var(--gw-stroke-dark)",
        borderRadius: 12, background: "var(--gw-ink-2)",
        textDecoration: "none",
        flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: "var(--rsd-accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icons.Cross width={14} height={14} style={{ color: "var(--rsd-accent-on)", strokeWidth: 2.5 }}/>
        </div>
        {!c && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 11, color: "#fff", lineHeight: 1 }}>Millard Community</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.4)", lineHeight: 1, marginTop: 2, letterSpacing: ".04em" }}>STAFF PORTAL</div>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {NAV.map(item => {
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="gw-press"
              style={{
                display: "flex",
                flexDirection: c ? "column" : "row",
                alignItems: "center",
                justifyContent: c ? "center" : "flex-start",
                gap: c ? 3 : 10,
                padding: c ? "7px 2px" : "8px 10px",
                borderRadius: 9,
                background: active ? "var(--gw-ink-2)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,.65)",
                border: "1px solid",
                borderColor: active ? "var(--gw-stroke-dark)" : "transparent",
                fontWeight: 700, fontSize: 13, lineHeight: 1,
                textDecoration: "none",
                transition: "background 150ms",
              }}
            >
              <span style={{ display: "flex", flexShrink: 0, color: active ? "var(--rsd-accent)" : "rgba(255,255,255,.5)" }}>
                {item.icon}
              </span>
              {c ? (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", opacity: 0.75 }}>
                  {item.label}
                </span>
              ) : item.label}
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
              background: "var(--gw-ink-3)", border: "1px solid var(--gw-stroke-dark)",
              color: "rgba(255,255,255,.75)", fontWeight: 700, fontSize: 13,
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}>
              {c ? <Icons.ChevronsRight width={16} height={16}/> : <Icons.ChevronsLeft width={16} height={16}/>}
            </span>
            {!c && "Collapse"}
          </button>
        )}
        <Link
          href="/login"
          style={{
            display: "flex", alignItems: "center", justifyContent: c ? "center" : "flex-start",
            gap: 10, padding: "10px 12px", borderRadius: 10,
            color: "rgba(255,255,255,.5)", fontWeight: 700, fontSize: 13,
            textDecoration: "none", transition: "color 150ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gw-error)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,.5)")}
        >
          <Icons.LogOut width={16} height={16}/>
          {!c && "Sign out"}
        </Link>
      </div>
    </aside>
  );
}
