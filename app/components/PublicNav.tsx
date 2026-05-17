"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icons } from "./icons";

const NAV_LINKS = [
  { href: "/",           label: "Home" },
  { href: "/about",      label: "About" },
  { href: "/services",   label: "Services" },
  { href: "/sermons",    label: "Sermons" },
  { href: "/maintenance",label: "Maintenance" },
];

export function PublicNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--gw-border)",
        height: 64,
        display: "flex", alignItems: "center",
        padding: "0 24px",
        gap: 24,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "var(--rsd-accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icons.Cross width={18} height={18} style={{ color: "var(--rsd-accent-on)", strokeWidth: 2.5 }}/>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "var(--gw-fg)", lineHeight: 1, letterSpacing: "-.01em" }}>
              Millard Community
            </span>
            <span style={{ fontWeight: 600, fontSize: 11, color: "var(--gw-fg-muted)", lineHeight: 1, letterSpacing: ".01em" }}>
              CHURCH
            </span>
          </div>
        </Link>

        {/* Desktop nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}
          className="desktop-nav">
          {NAV_LINKS.map(link => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: "7px 14px",
                  borderRadius: 100,
                  fontSize: 13, fontWeight: 700,
                  color: active ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                  background: active ? "var(--rsd-accent-bg)" : "transparent",
                  transition: "all 150ms",
                  whiteSpace: "nowrap",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <Link
            href="/portal"
            style={{
              padding: "8px 18px",
              borderRadius: 100,
              fontSize: 13, fontWeight: 700,
              color: "var(--rsd-accent-on)",
              background: "var(--rsd-accent)",
              border: "1px solid var(--rsd-accent)",
              display: "inline-flex", alignItems: "center", gap: 6,
              transition: "opacity 150ms",
              whiteSpace: "nowrap",
            }}
          >
            <Icons.Shield width={13} height={13}/>
            Staff Portal
          </Link>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            style={{
              display: "none",
              width: 36, height: 36, borderRadius: 8,
              background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
              color: "var(--gw-fg)", alignItems: "center", justifyContent: "center",
            }}
            className="mobile-menu-btn"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <Icons.X width={16} height={16}/> : <Icons.Menu width={16} height={16}/>}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div style={{
          position: "fixed", top: 64, left: 0, right: 0,
          background: "var(--gw-bg)",
          borderBottom: "1px solid var(--gw-border)",
          zIndex: 99,
          padding: "12px 16px 20px",
          display: "flex", flexDirection: "column", gap: 4,
          animation: "gw-slide-up 160ms var(--gw-ease)",
        }}>
          {NAV_LINKS.map(link => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  fontSize: 15, fontWeight: 700,
                  color: active ? "var(--rsd-accent)" : "var(--gw-fg)",
                  background: active ? "var(--rsd-accent-bg)" : "transparent",
                }}
              >
                {link.label}
              </Link>
            );
          })}
          <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--gw-border)" }}>
            <Link
              href="/portal"
              onClick={() => setMobileOpen(false)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "12px 16px", borderRadius: 10,
                fontSize: 15, fontWeight: 700,
                color: "var(--rsd-accent)",
              }}
            >
              <Icons.Shield width={16} height={16}/>
              Staff Portal
            </Link>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
