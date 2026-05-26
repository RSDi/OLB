"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Icons } from "./icons";

interface PortalTopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}

export function PortalTopBar({
  title,
  subtitle,
  actions,
  onMenuClick,
  onSearchClick,
}: PortalTopBarProps) {
  return (
    <header
      className="rsd-topbar"
      style={{
        background: "var(--gw-bg)",
        borderBottom: "1px solid var(--gw-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 12,
      }}
    >
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="rsd-mob-menu gw-press"
        aria-label="Open navigation"
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          flexShrink: 0,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          color: "var(--gw-fg)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icons.Menu width={16} height={16} />
      </button>

      {/* Title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)", lineHeight: 1 }}>
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: "var(--gw-fg-muted)",
              lineHeight: 1,
              fontWeight: 500,
              marginTop: 3,
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {actions}
        {onSearchClick && <SearchTrigger onClick={onSearchClick} />}
        <button
          className="gw-press"
          aria-label="Notifications"
          style={{
            width: 36,
            height: 36,
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            color: "var(--gw-fg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <Icons.Bell width={16} height={16} />
        </button>
      </div>
    </header>
  );
}

// Search trigger: an icon-only circle button on mobile (same shape as the
// bell), and a wider pill with the keyboard hint on desktop. The Mac vs.
// Windows symbol is detected client-side; we render a neutral fallback
// during SSR/hydration to avoid a flash.
function SearchTrigger({ onClick }: { onClick: () => void }) {
  const [isMobile, setIsMobile] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const updateMobile = () => setIsMobile(mq.matches);
    updateMobile();
    mq.addEventListener("change", updateMobile);

    const ua = navigator.userAgent || navigator.platform || "";
    setHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "⌘K" : "Ctrl K");

    return () => mq.removeEventListener("change", updateMobile);
  }, []);

  if (isMobile) {
    return (
      <button
        onClick={onClick}
        className="gw-press"
        aria-label="Search"
        style={{
          width: 36,
          height: 36,
          borderRadius: 100,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          color: "var(--gw-fg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icons.Search width={16} height={16} />
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="gw-press"
      aria-label="Search (Ctrl K or Command K)"
      title="Search"
      style={{
        height: 36,
        padding: "0 8px 0 12px",
        borderRadius: 100,
        background: "var(--gw-bg-elev)",
        border: "1px solid var(--gw-border)",
        color: "var(--gw-fg-muted)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <Icons.Search width={14} height={14} />
      <span>Search</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 28,
          height: 22,
          padding: "0 6px",
          borderRadius: 6,
          border: "1px solid var(--gw-border)",
          background: "var(--gw-bg)",
          color: "var(--gw-fg-muted)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: ".02em",
        }}
      >
        {hint ?? "⌘K"}
      </span>
    </button>
  );
}
