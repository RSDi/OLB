"use client";
// The frame for the ? menu's dialogs (Ask for help, My requests): backdrop,
// a centered card with a title bar and a close button, Esc to close.
// Same look as InfoPanel.
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../icons";

export function HelpDialog({
  title,
  icon,
  onClose,
  canClose = true,
  footer,
  hidden = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  onClose: () => void;
  // False while sending or recording: Esc and the backdrop do nothing.
  canClose?: boolean;
  footer?: ReactNode;
  // Kept mounted but out of sight (while recording the screen).
  hidden?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  // Portaled: the top bar's own stacking context would trap a fixed dialog.
  return createPortal(
    <div
      onClick={() => canClose && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        background: "rgba(0,0,0,.45)",
        backdropFilter: "blur(2px)",
        display: hidden ? "none" : "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "8dvh 16px 16px",
        animation: "gw-fade-in 160ms ease",
        overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
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
          maxHeight: "84dvh",
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
            <span style={{ display: "flex", color: "var(--rsd-accent)", flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            aria-label="Close"
            className="gw-press rsd-tap"
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
              cursor: canClose ? "pointer" : "default",
              opacity: canClose ? 1 : 0.5,
            }}
          >
            <Icons.X width={14} height={14} />
          </button>
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", fontSize: 14, lineHeight: 1.6, color: "var(--gw-fg)" }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 8,
              padding: "12px 18px",
              borderTop: "1px solid var(--gw-border)",
              flexShrink: 0,
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
