"use client";
// A right-hand sheet over the page (full width on a phone), in the style of
// the Payments and Directory sheets. Closes on the ✕, a click outside it, or
// Escape, unless it's busy saving.

import { useEffect, type ReactNode } from "react";
import { Icons } from "./icons";

export function SideSheet({
  eyebrow,
  title,
  busy = false,
  width = 520,
  onClose,
  children,
  footer,
  tour,
}: {
  eyebrow?: string;
  title: string;
  busy?: boolean;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  // Pinned to the bottom (Save / Cancel).
  footer?: ReactNode;
  // Guided-tour anchor for the panel (lib/help/tours.ts).
  tour?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [busy, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow ? `${title} — ${eyebrow}` : title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(11,11,12,.38)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        data-tour={tour}
        style={{
          width: `min(${width}px, 100vw)`,
          height: "100%",
          background: "var(--gw-bg-elev)",
          boxShadow: "-12px 0 40px rgba(0,0,0,.18)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            padding: "20px 24px 12px",
            borderBottom: "1px solid var(--gw-border)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            {eyebrow && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "var(--gw-fg-muted)",
                }}
              >
                {eyebrow}
              </span>
            )}
            <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>{title}</span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={busy}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              borderRadius: "50%",
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy ? "default" : "pointer",
            }}
          >
            <Icons.X width={16} height={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              borderTop: "1px solid var(--gw-border)",
              padding: "12px 24px",
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              flexWrap: "wrap",
              background: "var(--gw-bg-elev)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
