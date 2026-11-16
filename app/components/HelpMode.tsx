"use client";
// Help mode: ? → Help for this page, on a page with a guided tour. Each part
// of the screen the tour points at (data-tour="<anchor>", from helpSpotsFor
// in lib/help/tours.ts) gets a dashed outline and an ⓘ on its top-right
// corner. Tapping one opens a card with what that part does, Show me how
// (the page's tour, starting at that part) and Read in User Guide. A bar at
// the bottom says help mode is on, opens the whole page's help, and turns it
// off. Esc closes the open card, then help mode. Ported from Operations.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HelpSpot } from "../../lib/help/tours";
import { MarkdownView } from "./MarkdownView";

type Box = { top: number; left: number; right: number; bottom: number };
const DOT = 22;
const BAR_SPACE = 76; // the bar at the bottom, and room around it

// The first one showing: a page can carry the same anchor twice, one for a
// phone and one for a computer, with the other hidden.
function boxOf(anchor: string): Box | null {
  for (const el of document.querySelectorAll(`[data-tour="${anchor}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) return { top: r.top, left: r.left, right: r.right, bottom: r.bottom };
  }
  return null;
}

export function HelpMode({
  spots,
  onExit,
  onWholePage,
  onShowMe,
  onNothingShowing,
}: {
  spots: HelpSpot[];
  onExit: () => void;
  // The page's whole User Guide section (the help panel).
  onWholePage: () => void;
  // Start the page's tour at this spot's step.
  onShowMe: (spot: HelpSpot) => void;
  // None of the parts are on screen (an empty list, a board-only page
  // opened by someone else): the shell shows the help panel instead.
  onNothingShowing: () => void;
}) {
  const [boxes, setBoxes] = useState<Record<string, Box | null>>({});
  const [clip, setClip] = useState<Box | null>(null);
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const checked = useRef(false);

  // Where each part is now. Parts load and move after the first paint, and
  // the page scrolls, so this re-reads on scroll, on resize and a few times a
  // second while help mode is on.
  const measure = useCallback(() => {
    const next: Record<string, Box | null> = {};
    for (const s of spots) next[s.anchor] = boxOf(s.anchor);
    setBoxes(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    const main = document.querySelector("main")?.getBoundingClientRect();
    const c = main && main.width && main.height ? { top: main.top, left: main.left, right: main.right, bottom: main.bottom } : null;
    setClip(prev => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c));
    setVw(window.innerWidth);
    setVh(window.innerHeight);
    return next;
  }, [spots]);

  useLayoutEffect(() => {
    let raf = requestAnimationFrame(measure);
    const soon = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", soon, true);
    window.addEventListener("resize", soon);
    const timer = setInterval(measure, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("scroll", soon, true);
      window.removeEventListener("resize", soon);
    };
  }, [measure]);

  // Give the page a moment to finish loading, then fall back to the help
  // panel if none of the parts exist on it.
  useEffect(() => {
    const t = setTimeout(() => {
      if (checked.current) return;
      checked.current = true;
      const now = measure();
      if (!Object.values(now).some(Boolean)) onNothingShowing();
    }, 600);
    return () => clearTimeout(t);
  }, [measure, onNothingShowing]);

  const openRef = useRef(openAnchor);
  useEffect(() => {
    openRef.current = openAnchor;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openRef.current) setOpenAnchor(null);
      else onExit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onExit]);

  // Inside the top-right corner of a card; off the corner of a small button.
  const dotAt = (b: Box) => ({
    top: Math.max(4, b.top - DOT / 2),
    left: b.right - b.left < 80 ? b.right - DOT / 2 : b.right - DOT - 14,
  });
  const visible = (b: Box | null | undefined): b is Box => {
    if (!b) return false;
    const { top } = dotAt(b);
    // The top bar sits above <main>, so its parts show even outside the clip.
    return !clip || b.bottom <= clip.top || (top >= clip.top - 2 && top + DOT <= Math.min(clip.bottom, vh - BAR_SPACE));
  };
  const open = spots.find(s => s.anchor === openAnchor) ?? null;
  const openBox = open ? boxes[open.anchor] : null;
  const outline = spots
    .filter(s => boxes[s.anchor])
    .map(s => `[data-tour="${s.anchor}"]`)
    .join(",");

  return (
    <>
      {outline && (
        <style>{`${outline}{outline:2px dashed color-mix(in srgb, var(--rsd-accent) 70%, transparent);outline-offset:3px}`}</style>
      )}
      {spots.map(s => {
        const b = boxes[s.anchor];
        if (!visible(b)) return null;
        const at = dotAt(b);
        const on = openAnchor === s.anchor;
        return (
          <button
            key={s.anchor}
            type="button"
            aria-label={`Help: ${s.title}`}
            aria-expanded={on}
            className="gw-press"
            onClick={() => setOpenAnchor(on ? null : s.anchor)}
            style={{
              position: "fixed",
              top: at.top,
              left: at.left,
              width: DOT,
              height: DOT,
              zIndex: 1300,
              borderRadius: "50%",
              padding: 0,
              cursor: "pointer",
              border: "2px solid var(--gw-bg)",
              background: "var(--rsd-accent)",
              color: "var(--rsd-accent-on)",
              fontFamily: "Georgia, serif",
              fontStyle: "italic",
              fontWeight: 800,
              fontSize: 13,
              lineHeight: 1,
              boxShadow: on
                ? "0 0 0 4px color-mix(in srgb, var(--rsd-accent) 35%, transparent)"
                : "0 1px 4px rgba(0,0,0,.25)",
            }}
          >
            i
          </button>
        );
      })}
      {open && (
        <SpotCard
          spot={open}
          box={visible(openBox) ? openBox : null}
          vw={vw}
          vh={vh}
          onClose={() => setOpenAnchor(null)}
          onShowMe={() => {
            onExit();
            onShowMe(open);
          }}
          onGuide={() => {
            onExit();
            onWholePage();
          }}
        />
      )}
      <div
        role="status"
        style={{
          position: "fixed",
          bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          zIndex: 1300,
          ...(vw < 600 ? { left: 12, right: 12 } : { left: "50%", transform: "translateX(-50%)" }),
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 8px 8px 14px",
          borderRadius: 12,
          whiteSpace: "nowrap",
          background: "var(--gw-ink, #1a1a1a)",
          color: "#fff",
          boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          fontSize: 12.5,
        }}
      >
        <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          <b>Help mode</b>
          {vw >= 600 && (
            <span style={{ opacity: 0.75 }}>
              {" "}
              · tap an <b style={{ color: "var(--rsd-accent)" }}>ⓘ</b> to learn that part
            </span>
          )}
        </span>
        <button
          type="button"
          className="gw-press"
          onClick={() => {
            onExit();
            onWholePage();
          }}
          style={barBtn(false)}
        >
          Whole page
        </button>
        <button type="button" className="gw-press" onClick={onExit} style={barBtn(true)}>
          Done
        </button>
      </div>
    </>
  );
}

function SpotCard({
  spot,
  box,
  vw,
  vh,
  onClose,
  onShowMe,
  onGuide,
}: {
  spot: HelpSpot;
  box: Box | null;
  vw: number;
  vh: number;
  onClose: () => void;
  onShowMe: () => void;
  onGuide: () => void;
}) {
  // A sheet above the bar on a phone (or when the ⓘ has scrolled away);
  // otherwise under the ⓘ, or above it when there's no room below.
  const width = Math.min(380, vw - 24);
  let place: React.CSSProperties;
  if (vw < 600 || !box) {
    place = { left: 12, right: 12, bottom: BAR_SPACE, maxHeight: Math.max(200, vh * 0.6) };
  } else {
    const dotTop = Math.max(4, box.top - DOT / 2);
    const left = Math.max(12, Math.min(box.right - 14 - width, vw - width - 12));
    const below = vh - BAR_SPACE - (dotTop + DOT + 8);
    place =
      below >= 240
        ? { left, width, top: dotTop + DOT + 8, maxHeight: below }
        : { left, width, bottom: vh - dotTop + 8, maxHeight: Math.max(200, dotTop - 20) };
  }
  return (
    <div
      role="dialog"
      aria-label={spot.title}
      style={{
        position: "fixed",
        zIndex: 1350,
        ...place,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--gw-bg)",
        border: "1px solid var(--gw-border)",
        borderRadius: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,.22)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 4px" }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)", flex: 1 }}>{spot.title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg-muted)",
            cursor: "pointer",
            fontSize: 16,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
      <div
        className="rsd-markdown"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 14px 8px", fontSize: 13.5, lineHeight: 1.55, color: "var(--gw-fg)" }}
      >
        <MarkdownView>{spot.body}</MarkdownView>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid var(--gw-border)",
        }}
      >
        <button type="button" onClick={onGuide} style={cardBtn(false)}>
          Read in User Guide
        </button>
        <button type="button" onClick={onShowMe} style={cardBtn(true)}>
          ▶ Show me how
        </button>
      </div>
    </div>
  );
}

const barBtn = (primary: boolean): React.CSSProperties => ({
  border: "none",
  borderRadius: 8,
  padding: "6px 11px",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
  background: primary ? "var(--rsd-accent)" : "rgba(255,255,255,.12)",
  color: primary ? "var(--rsd-accent-on)" : "#fff",
});

const cardBtn = (primary: boolean): React.CSSProperties => ({
  padding: "7px 12px",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  border: `1px solid ${primary ? "var(--rsd-accent)" : "var(--gw-border)"}`,
  background: primary ? "var(--rsd-accent)" : "none",
  color: primary ? "var(--rsd-accent-on)" : "var(--gw-fg-muted)",
});
