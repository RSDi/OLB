"use client";
import type { ReactNode } from "react";
import { Icons } from "./icons";

interface PortalTopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onMenuClick?: () => void;
}

export function PortalTopBar({ title, subtitle, actions, onMenuClick }: PortalTopBarProps) {
  return (
    <header className="rsd-topbar" style={{
      background: "var(--gw-bg)",
      borderBottom: "1px solid var(--gw-border)",
      display: "flex", alignItems: "center",
      padding: "0 20px", gap: 12,
    }}>
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="rsd-mob-menu gw-press"
        aria-label="Open navigation"
        style={{
          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
          background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
          color: "var(--gw-fg)", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icons.Menu width={16} height={16}/>
      </button>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)", lineHeight: 1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1, fontWeight: 500, marginTop: 3 }}>{subtitle}</div>}
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {actions}
        <button className="gw-press" aria-label="Notifications" style={{
          width: 36, height: 36, borderRadius: 100,
          background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
          color: "var(--gw-fg)", display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <Icons.Bell width={16} height={16}/>
        </button>
      </div>
    </header>
  );
}
