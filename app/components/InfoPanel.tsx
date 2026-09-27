"use client";
// The per-page help panel. Opened by the "i" button in the top bar; shows the
// User Guide section for the current page (markdown), with a link through to
// the full guide at that section, and "Show me around" when the page has a
// guided tour (lib/help/tours.ts). Mirrors the GlobalSearch modal: backdrop +
// centered card on desktop, full-screen sheet on mobile, Esc to close.
import { useEffect } from "react";
import Link from "next/link";
import { Icons } from "./icons";
import { MarkdownView } from "./MarkdownView";
import { guideHref, type GuideSection } from "../../lib/help/guide";

export function InfoPanel({
  section,
  open,
  onClose,
  onStartTour,
}: {
  section: GuideSection | null;
  open: boolean;
  onClose: () => void;
  // Starts this page's guided tour; absent when it has none.
  onStartTour?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !section) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8vh 16px 16px",
        animation: "gw-fade-in 160ms ease",
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`About ${section.title}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          borderRadius: 14,
          boxShadow: "var(--gw-shadow-3)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "84vh",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid var(--gw-border)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Icons.Info width={16} height={16} style={{ color: "var(--rsd-accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>{section.title}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="gw-press"
            style={{
              width: 30,
              height: 30,
              borderRadius: 100,
              flexShrink: 0,
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              color: "var(--gw-fg-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Icons.X width={14} height={14} />
          </button>
        </div>

        <div
          className="rsd-markdown"
          style={{ padding: "16px 20px", overflowY: "auto", fontSize: 14, lineHeight: 1.65, color: "var(--gw-fg)" }}
        >
          <MarkdownView>{section.body}</MarkdownView>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 18px",
            borderTop: "1px solid var(--gw-border)",
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {onStartTour && (
            <button
              type="button"
              onClick={onStartTour}
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "transparent",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Show me around
            </button>
          )}
          <Link
            href={guideHref(section.id)}
            prefetch={false}
            onClick={onClose}
            className="gw-press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 100,
              background: "var(--rsd-accent)",
              color: "var(--rsd-accent-on)",
              border: "1px solid var(--rsd-accent)",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            Open the User Guide
            <Icons.ArrowRight width={14} height={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
