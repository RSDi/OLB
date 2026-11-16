"use client";
// The top-bar "?" menu: one place for help on every page. "Help for this page"
// opens the User Guide section for the page you're on (InfoPanel), "Show me
// around" runs that page's guided tour, then the whole User Guide and Release
// Notes. Rows a page has nothing for are left out. Mirrors Operations' ? menu.
import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";

type Row = { key: string; label: string; Icon: typeof Icons.Info; onClick: () => void };

export function HelpMenu({
  onPageHelp,
  onPageTour,
  onUserGuide,
  onReleaseNotes,
}: {
  // Absent when the page has no guide section / no tour / the viewer can't
  // open Release Notes yet; that row is then left out.
  onPageHelp?: () => void;
  onPageTour?: () => void;
  onUserGuide: () => void;
  onReleaseNotes?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rows: Row[] = [];
  if (onPageHelp) rows.push({ key: "page", label: "Help for this page", Icon: Icons.Info, onClick: onPageHelp });
  if (onPageTour) rows.push({ key: "tour", label: "Show me around", Icon: Icons.Sparkles, onClick: onPageTour });
  rows.push({ key: "guide", label: "User Guide", Icon: Icons.BookOpen, onClick: onUserGuide });
  if (onReleaseNotes) rows.push({ key: "notes", label: "Release Notes", Icon: Icons.FileText, onClick: onReleaseNotes });

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="gw-press"
        data-tour="page-help"
        aria-label="Help"
        title="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 100,
          background: "var(--rsd-topbar-2)",
          border: "1px solid var(--rsd-topbar-line)",
          color: "var(--rsd-topbar-fg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icons.Help width={16} height={16} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Help"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1200,
            minWidth: 220,
            background: "var(--gw-bg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,.16)",
            padding: 6,
          }}
        >
          {rows.map(row => (
            <button
              key={row.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                row.onClick();
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "9px 10px",
                border: "none",
                background: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "var(--gw-fg)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--gw-bg-elev)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <span style={{ display: "flex", color: "var(--gw-fg-muted)" }}>
                <row.Icon width={16} height={16} />
              </span>
              {row.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
