"use client";
import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { Icons } from "./icons";
import { TopbarSearch, type TopbarSearchHandle } from "./TopbarSearch";

interface PortalTopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onMenuClick?: () => void;
  // Click handler for the pill button (small/medium viewports). Opens
  // the modal in PortalShell. Ignored on large viewports where the
  // inline TopbarSearch renders instead.
  onSearchClick?: () => void;
  inlineSearchRef?: React.Ref<TopbarSearchHandle>;
  // Opens the per-page help panel. Provided only when the current page has a
  // doc (PortalShell decides); when absent the "i" button is hidden.
  onInfoClick?: () => void;
}

export function PortalTopBar({
  title,
  subtitle,
  actions,
  onMenuClick,
  onSearchClick,
  inlineSearchRef,
  onInfoClick,
}: PortalTopBarProps) {
  const [variant, setVariant] = useState<"pill" | "inline" | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setVariant(mq.matches ? "inline" : "pill");
    const handler = (e: MediaQueryListEvent) =>
      setVariant(e.matches ? "inline" : "pill");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <header
      className="rsd-topbar"
      style={{
        background: "var(--rsd-frame)",
        borderBottom: "1px solid var(--rsd-frame-line)",
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
          background: "var(--rsd-frame-2)",
          border: "1px solid var(--rsd-frame-line)",
          color: "var(--rsd-frame-fg)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icons.Menu width={16} height={16} />
      </button>

      {/* `subtitle` is the broader section (e.g. "Slack Archive", "Calendar",
          "Directory") and `title` is the specific page within it (e.g.
          "Channel", "New event", "Households") — per PortalShell's PAGE_META.
          The section reads as the more prominent, orienting piece of
          information ("where am I broadly"), so it gets the large/bold
          treatment; the specific page is the secondary line underneath.
          When there's no section (subtitle empty), title alone takes the
          large/bold treatment instead of being stranded as a small line
          with nothing above it. */}
      <div style={{ flex: variant === "inline" ? "0 0 auto" : 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--rsd-display)",
            fontWeight: 700,
            fontSize: "calc(16px * var(--rsd-display-scale))",
            letterSpacing: ".02em",
            textTransform: "uppercase",
            color: "var(--rsd-frame-fg)",
            lineHeight: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle || title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 12,
              color: "var(--rsd-frame-fg-3)",
              lineHeight: 1,
              fontWeight: 500,
              marginTop: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
        )}
      </div>

      {/* Inline search occupies the middle band on large viewports */}
      {variant === "inline" && (
        <div style={{ flex: 1, display: "flex", justifyContent: "center", minWidth: 0 }}>
          <TopbarSearch ref={inlineSearchRef} />
        </div>
      )}

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {actions}
        {variant === "pill" && onSearchClick && (
          <PillTrigger onClick={onSearchClick} />
        )}
        {onInfoClick && (
          <button
            onClick={onInfoClick}
            className="gw-press"
            aria-label="About this page"
            title="About this page"
            style={{
              width: 36,
              height: 36,
              borderRadius: 100,
              background: "var(--rsd-frame-2)",
              border: "1px solid var(--rsd-frame-line)",
              color: "var(--rsd-frame-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icons.Info width={16} height={16} />
          </button>
        )}
        <button
          className="gw-press"
          aria-label="Notifications"
          style={{
            width: 36,
            height: 36,
            borderRadius: 100,
            background: "var(--rsd-frame-2)",
            border: "1px solid var(--rsd-frame-line)",
            color: "var(--rsd-frame-fg)",
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

// Compact circular search button shown on mobile + medium viewports. Click
// opens the GlobalSearch modal owned by PortalShell.
function PillTrigger({ onClick }: { onClick: () => void }) {
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
          background: "var(--rsd-frame-2)",
          border: "1px solid var(--rsd-frame-line)",
          color: "var(--rsd-frame-fg)",
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
        background: "var(--rsd-frame-2)",
        border: "1px solid var(--rsd-frame-line)",
        color: "var(--rsd-frame-fg-3)",
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
          border: "1px solid var(--rsd-frame-line)",
          background: "var(--rsd-frame)",
          color: "var(--rsd-frame-fg-3)",
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
