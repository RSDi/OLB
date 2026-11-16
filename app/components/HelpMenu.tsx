"use client";
// The top-bar "?" menu: one place for help on every page. "Help for this page"
// opens the User Guide section for the page you're on (InfoPanel), "Show me
// around" runs that page's guided tour, then the whole User Guide and Release
// Notes. Under a line, Ask for help (to the board, and #olb-help in Slack)
// and My requests, with a dot on ? when the board has replied. Rows a page
// has nothing for are left out. Mirrors Operations' ? menu.
import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";
import { countMyUnreadHelp } from "../../lib/help-requests/actions";
import { AskForHelpDialog } from "./help/AskForHelpDialog";
import { MyHelpRequestsDialog } from "./help/MyHelpRequestsDialog";

type Row = { key: string; label: string; Icon: typeof Icons.Info; onClick: () => void; badge?: number };

export function HelpMenu({
  onPageHelp,
  onPageTour,
  onUserGuide,
  onReleaseNotes,
  onHelpCenter,
  canAsk = false,
}: {
  // Absent when the page has no guide section / no tour / the viewer can't
  // open Release Notes yet; that row is then left out.
  onPageHelp?: () => void;
  onPageTour?: () => void;
  onUserGuide: () => void;
  onReleaseNotes?: () => void;
  // Short how-tos (/portal/help-center).
  onHelpCenter?: () => void;
  // Signed in: Ask for help and My requests.
  canAsk?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [mine, setMine] = useState(false);
  // Board replies on my requests I haven't opened (the dot on ?).
  const [unread, setUnread] = useState(0);
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

  // On load, and again when My requests closes. A failed count shows no dot.
  useEffect(() => {
    if (!canAsk || mine) return;
    let live = true;
    countMyUnreadHelp().then(
      n => live && setUnread(n),
      () => live && setUnread(0),
    );
    return () => {
      live = false;
    };
  }, [canAsk, mine]);

  const rows: Row[] = [];
  if (onPageHelp) rows.push({ key: "page", label: "Help for this page", Icon: Icons.Info, onClick: onPageHelp });
  if (onPageTour) rows.push({ key: "tour", label: "Show me around", Icon: Icons.Sparkles, onClick: onPageTour });
  rows.push({ key: "guide", label: "User Guide", Icon: Icons.BookOpen, onClick: onUserGuide });
  if (onReleaseNotes) rows.push({ key: "notes", label: "Release Notes", Icon: Icons.FileText, onClick: onReleaseNotes });
  if (onHelpCenter) rows.push({ key: "center", label: "Help Center", Icon: Icons.Help, onClick: onHelpCenter });
  const askRows: Row[] = canAsk
    ? [
        { key: "ask", label: "Ask for help", Icon: Icons.LifeBuoy, onClick: () => setAsking(true) },
        { key: "mine", label: "My requests", Icon: Icons.Inbox, onClick: () => setMine(true), badge: unread },
      ]
    : [];

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        className="gw-press"
        data-tour="page-help"
        aria-label={unread > 0 ? `Help · ${unread} new ${unread === 1 ? "reply" : "replies"}` : "Help"}
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
          position: "relative",
        }}
      >
        <Icons.Help width={16} height={16} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: 1,
              right: 1,
              width: 9,
              height: 9,
              borderRadius: 9,
              background: "var(--rsd-accent)",
              border: "2px solid var(--rsd-topbar)",
            }}
          />
        )}
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
          {rows.map(renderRow)}
          {askRows.length > 0 && (
            <div role="separator" style={{ height: 1, background: "var(--gw-border)", margin: "4px 6px" }} />
          )}
          {askRows.map(renderRow)}
        </div>
      )}
      {asking && (
        <AskForHelpDialog
          onClose={() => setAsking(false)}
          onShowMine={() => {
            setAsking(false);
            setMine(true);
          }}
        />
      )}
      {mine && (
        <MyHelpRequestsDialog
          onClose={() => setMine(false)}
          onAsk={() => {
            setMine(false);
            setAsking(true);
          }}
        />
      )}
    </div>
  );

  function renderRow(row: Row) {
    return (
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
              {!!row.badge && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--rsd-accent-on)",
                    background: "var(--rsd-accent)",
                    borderRadius: 20,
                    padding: "0 7px",
                  }}
                >
                  {row.badge}
                </span>
              )}
            </button>
    );
  }
}
