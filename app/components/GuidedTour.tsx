"use client";
// The guided tour overlay: dims the page, rings the element a step points at,
// and shows a callout beside it with Back / Next / Skip tour. Steps come from
// lib/help/tours.ts. PortalShell owns which tour is running and hands out
// `useTour().start(id)` to the User Guide and the "i" panel.
//
// The page underneath can't be clicked while a tour runs (so a stray tap
// can't navigate away mid-tour), except the highlighted element on an
// `interactive` step. ← / → move between steps and Esc ends it. A step can
// be on another page (the tour goes there) and can click something open
// first; see TourStep in lib/help/tours.ts.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "./icons";
import { MarkdownView } from "./MarkdownView";
import {
  getTour,
  nextPartIndex,
  partAt,
  partStartIndex,
  stepRoute,
  tourStepsFor,
} from "../../lib/help/tours";
import type { GuideViewer } from "../../lib/help/guide";

// `part` starts a tour with parts at that part (1 = the first).
export type StartTour = (tourId: string, opts?: { part?: number }) => void;

export const TourContext = createContext<{ start: StartTour }>({ start: () => {} });

export function useTour() {
  return useContext(TourContext);
}

// How long to look for a step's element before skipping the step: a moment on
// a page that's already loaded, longer just after navigating (the page may
// still be fetching).
const SETTLED_WAIT_MS = 500;
const AFTER_NAV_WAIT_MS = 4000;

const SPOT_PAD = 6; // ring around the element
const GAP = 14; // ring to callout
const MARGIN = 16; // callout to screen edge
const CARD_MAX_W = 360;
const ARROW = 12;

type Rect = { top: number; left: number; width: number; height: number };
type Side = "bottom" | "top" | "right" | "left";

function findTarget(target: string): HTMLElement | null {
  // The first visible match: several elements can share a target (every
  // player row, say) and some only render on one screen size.
  const all = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth) return el;
  }
  return null;
}

// Chooses the first real option of a drop-down still on its "All …" option,
// the way picking it by hand would (React hears the change event).
function pickFirstOption(el: HTMLElement) {
  const select = el instanceof HTMLSelectElement ? el : el.querySelector("select");
  if (!select || select.selectedIndex > 0 || select.options.length < 2) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(select, select.options[1].value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

// A marked wrapper around a button clicks the button inside it.
function press(el: HTMLElement) {
  const inner = el.matches("button, a, [role=button]") ? el : el.querySelector<HTMLElement>("button, a, [role=button]");
  (inner ?? el).click();
}

// Typing in a field on an interactive step shouldn't flip the tour's steps.
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

interface Props {
  tourId: string;
  // Start at this part (1 = the first) of a tour with parts.
  startPart?: number;
  viewer: GuideViewer | null;
  onClose: () => void;
  // The current step points into the sidebar (true) or not (false), so the
  // shell can slide the drawer open on phones.
  onSidebarStep: (inSidebar: boolean) => void;
}

export function GuidedTour({ tourId, startPart, viewer, onClose, onSidebarStep }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const tour = getTour(tourId);
  const steps = useMemo(() => (tour ? tourStepsFor(tour, viewer) : []), [tour, viewer]);

  // Started at a later part: count from there, and Back stops there.
  const [startIndex] = useState(() => (startPart ? partStartIndex(steps, startPart) : 0));
  const [index, setIndex] = useState(startIndex);
  const [dir, setDir] = useState<1 | -1>(1);
  // The last step whose element was found. Until it matches `index` only the
  // dimmed backdrop shows.
  const [foundIndex, setFoundIndex] = useState<number | null>(null);
  // Steps skipped because their element isn't on the page, so the "3 of 9"
  // count doesn't promise steps that never come.
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(() => new Set(Array.from({ length: startIndex }, (_, i) => i)));
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(200);
  // Only ever rendered after a click or an effect, so `window` is there.
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
  );

  const elRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const lastNavAt = useRef(0);
  // The page and step route the routing effect last saw, and the page the
  // tour is on its way to.
  const seen = useRef<{ path: string; route: string } | null>(null);
  const heading = useRef<string | null>(null);

  const step = steps[index];
  const route = tour && step ? stepRoute(tour, step) : null;
  const onRoute = !!route && pathname === route;
  const visible = !!step && onRoute && (!step.target || foundIndex === index);

  // Go to each step's page. When the step moves to another page the tour
  // takes people there; when the page changes under a step (the browser's
  // Back button, a link, a redirect instead of the page asked for), the tour
  // ends rather than dragging people back.
  useEffect(() => {
    if (!tour || !route) {
      onClose();
      return;
    }
    const was = seen.current;
    seen.current = { path: pathname, route };
    if (!was || was.path !== pathname) lastNavAt.current = Date.now();
    if (pathname === route) {
      heading.current = null;
      return;
    }
    if (!was || was.route !== route) {
      if (heading.current !== route) {
        heading.current = route;
        router.push(route);
      }
      return;
    }
    // Same step, same page as last time: an effect re-run while on the way.
    if (heading.current === route && was.path === pathname) return;
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs per page or step-page change only
  }, [pathname, route]);

  useEffect(() => {
    onSidebarStep(!!step?.sidebar);
  }, [step, onSidebarStep]);

  useEffect(() => {
    return () => onSidebarStep(false);
  }, [onSidebarStep]);

  function finish() {
    onClose();
  }

  function go(delta: 1 | -1) {
    const next = index + delta;
    if (next >= steps.length) return finish();
    if (next < startIndex) return;
    setDir(delta);
    setIndex(next);
  }

  // Find the current step's element, opening things on the way when moving
  // forward; skip the step (or its whole part) if it never shows up.
  useEffect(() => {
    elRef.current = null;
    if (!step || !onRoute) return;
    const forward = dir === 1;
    if (forward && step.dismiss) {
      const closer = findTarget(step.dismiss);
      if (closer) press(closer);
    }
    if (!step.target) return;
    const target = step.target;
    let deadline = Math.max(Date.now() + SETTLED_WAIT_MS, lastNavAt.current + AFTER_NAV_WAIT_MS);
    let clicked = false;
    let picked = false;
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      if (forward && step.pick && !picked) {
        const drop = findTarget(step.pick);
        if (drop) {
          pickFirstOption(drop);
          picked = true;
        }
      }
      const el = findTarget(target);
      if (el) {
        elRef.current = el;
        const r = el.getBoundingClientRect();
        if (r.top < MARGIN || r.bottom > window.innerHeight - MARGIN) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        setFoundIndex(index);
        setSkipped((cur) => {
          if (!cur.has(index)) return cur;
          const out = new Set(cur);
          out.delete(index);
          return out;
        });
        return;
      }
      if (forward && step.click && !clicked) {
        const opener = findTarget(step.click);
        if (opener) {
          press(opener);
          clicked = true;
          // A click can load a view from the server (a Planning tab is its
          // own address), so give it as long as a page change.
          deadline = Math.max(deadline, Date.now() + AFTER_NAV_WAIT_MS);
        }
      }
      if (Date.now() < deadline) {
        timer = setTimeout(look, 100);
        return;
      }
      // Not on this page for this person: move on in the same direction. A
      // part whose first step is missing (a board member who can't edit
      // Settings, say) is skipped whole. At the very start going back,
      // there's nothing earlier, so go forward.
      const next = forward && step.part ? nextPartIndex(steps, index) : index + dir;
      setSkipped((cur) => {
        const out = new Set(cur);
        const end = forward && step.part ? next : index + 1;
        for (let i = index; i < end; i++) out.add(i);
        return out;
      });
      if (next >= steps.length) finish();
      else if (next < startIndex) {
        setDir(1);
        setIndex(index + 1);
      } else setIndex(next);
    };
    timer = setTimeout(look, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per step and on arrival
  }, [index, onRoute]);

  // Follow the element as the page scrolls, resizes or shifts.
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const tick = () => {
      setViewport((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }
      );
      const target = step?.target;
      if (target) {
        let el = elRef.current;
        if (!el || !el.isConnected) el = elRef.current = findTarget(target);
        const r = el?.getBoundingClientRect();
        const next = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
        setRect((cur) => (sameRect(cur, next) ? cur : next));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, step]);

  // The callout's height decides where it fits.
  useEffect(() => {
    const card = cardRef.current;
    if (!visible || !card) return;
    const ro = new ResizeObserver(() => setCardH(card.offsetHeight));
    ro.observe(card);
    return () => ro.disconnect();
  }, [visible]);

  // Ready for Enter / Space, except where people are meant to use the page.
  useEffect(() => {
    if (visible && !step?.interactive) nextRef.current?.focus({ preventScroll: true });
  }, [visible, index, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && isEditable(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!tour || !step) return null;

  const isLast = index === steps.length - 1;
  const total = steps.length - skipped.size;
  const position = index + 1 - [...skipped].filter((i) => i < index).length;
  const spot = visible && step.target && rect ? rect : null;
  const place = placeCard(spot, viewport.w, viewport.h, cardH);
  const part = partAt(steps, index);
  // On an interactive step only the ring's hole lets clicks through: four
  // blockers cover the rest of the screen.
  const hole = spot && step.interactive ? spot : null;

  return (
    // Covers the whole screen, so clicks never reach the page underneath.
    <div style={{ position: "fixed", inset: 0, zIndex: 1500, pointerEvents: hole ? "none" : "auto" }}>
      {hole && <Blockers hole={hole} />}
      {spot ? (
        <div
          style={{
            position: "fixed",
            top: spot.top - SPOT_PAD,
            left: spot.left - SPOT_PAD,
            width: spot.width + SPOT_PAD * 2,
            height: spot.height + SPOT_PAD * 2,
            borderRadius: 10,
            // Yellow ring with a dark edge: shows on the black sidebar and the
            // white page alike.
            boxShadow: "0 0 0 3px var(--rsd-accent-fill), 0 0 0 5px var(--rsd-accent), 0 0 0 9999px rgba(12,12,14,.6)",
            transition: "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(12,12,14,.6)", animation: "gw-fade-in 160ms ease" }} />
      )}

      {visible && (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="gw-tour-title"
          aria-describedby="gw-tour-body"
          style={{
            position: "fixed",
            top: place.top,
            left: place.left,
            width: place.width,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 14,
            boxShadow: "var(--gw-shadow-3)",
            color: "var(--gw-fg)",
            animation: "gw-fade-in 160ms ease",
            pointerEvents: "auto",
          }}
        >
          {place.arrow && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                width: ARROW,
                height: ARROW,
                background: "var(--gw-bg-elev)",
                border: "1px solid var(--gw-border)",
                transform: "rotate(45deg)",
                ...arrowStyle(place.arrow.side, place.arrow.offset),
              }}
            />
          )}
          <div style={{ padding: "14px 18px 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--gw-fg-muted)",
              }}
            >
              {total > 1 ? `${tour.title} · ${position} of ${total}` : tour.title}
            </span>
            <button
              type="button"
              onClick={finish}
              aria-label="Close tour"
              className="gw-press"
              style={{
                width: 28,
                height: 28,
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
              <Icons.X width={13} height={13} />
            </button>
          </div>
          <div style={{ padding: "6px 18px 0" }}>
            {part && (
              <div
                style={{
                  display: "inline-block",
                  marginBottom: 6,
                  padding: "2px 8px",
                  borderRadius: 100,
                  background: "var(--rsd-accent-fill)",
                  color: "var(--rsd-accent-fill-on)",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                Part {part.number} of {part.of} · {part.name}
              </div>
            )}
            <h2 id="gw-tour-title" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--gw-fg)" }}>
              {step.title}
            </h2>
            <div
              id="gw-tour-body"
              className="rsd-markdown"
              style={{ fontSize: 14, lineHeight: 1.55, color: "var(--gw-fg)", marginTop: 6 }}
            >
              <MarkdownView>{step.body}</MarkdownView>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "12px 18px 14px",
            }}
          >
            {!isLast ? (
              <button
                type="button"
                onClick={finish}
                style={{
                  background: "none",
                  border: "none",
                  padding: "6px 0",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  cursor: "pointer",
                }}
              >
                Skip tour
              </button>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              {index > startIndex && (
                <button type="button" onClick={() => go(-1)} className="gw-press" style={pillStyle(false)}>
                  Back
                </button>
              )}
              <button ref={nextRef} type="button" onClick={() => go(1)} className="gw-press" style={pillStyle(true)}>
                {isLast ? "Done" : "Next"}
                {!isLast && <Icons.ArrowRight width={14} height={14} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Four panels around the ring's hole that catch clicks, so only the
// highlighted element can be used.
function Blockers({ hole }: { hole: Rect }) {
  const top = hole.top - SPOT_PAD;
  const left = hole.left - SPOT_PAD;
  const bottom = hole.top + hole.height + SPOT_PAD;
  const right = hole.left + hole.width + SPOT_PAD;
  const base: React.CSSProperties = { position: "fixed", pointerEvents: "auto" };
  return (
    <>
      <div style={{ ...base, top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div style={{ ...base, top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div style={{ ...base, top, left: 0, width: Math.max(0, left), height: bottom - top }} />
      <div style={{ ...base, top, left: right, right: 0, height: bottom - top }} />
    </>
  );
}

function pillStyle(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 100,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    border: "1px solid",
    ...(primary
      ? { background: "var(--rsd-accent)", color: "var(--rsd-accent-on)", borderColor: "var(--rsd-accent)" }
      : { background: "transparent", color: "var(--gw-fg)", borderColor: "var(--gw-border)" }),
  };
}

// Where the callout goes: beside the ring on whichever side has room (the
// sides first for tall things like the sidebar), else docked to the bottom
// of the screen. No ring → the middle of the screen.
function placeCard(
  spot: Rect | null,
  vw: number,
  vh: number,
  ch: number
): { top: number; left: number; width: number; arrow: { side: Side; offset: number } | null } {
  const width = Math.max(0, Math.min(CARD_MAX_W, vw - MARGIN * 2));
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
  if (!spot) {
    return { top: Math.max(MARGIN, (vh - ch) / 2), left: (vw - width) / 2, width, arrow: null };
  }
  const s = {
    top: spot.top - SPOT_PAD,
    left: spot.left - SPOT_PAD,
    right: spot.left + spot.width + SPOT_PAD,
    bottom: spot.top + spot.height + SPOT_PAD,
  };
  const cx = (s.left + s.right) / 2;
  const cy = (Math.max(s.top, 0) + Math.min(s.bottom, vh)) / 2;
  const fits: Record<Side, boolean> = {
    bottom: vh - s.bottom >= ch + GAP + MARGIN,
    top: s.top >= ch + GAP + MARGIN,
    right: vw - s.right >= width + GAP + MARGIN,
    left: s.left >= width + GAP + MARGIN,
  };
  const order: Side[] = s.bottom - s.top > vh * 0.5 ? ["right", "left", "bottom", "top"] : ["bottom", "top", "right", "left"];
  const side = order.find((o) => fits[o]);
  const arrowX = (left: number) => clamp(cx - left, 18, width - 18);
  switch (side) {
    case "bottom": {
      const left = clamp(cx - width / 2, MARGIN, vw - width - MARGIN);
      return { top: s.bottom + GAP, left, width, arrow: { side, offset: arrowX(left) } };
    }
    case "top": {
      const left = clamp(cx - width / 2, MARGIN, vw - width - MARGIN);
      return { top: s.top - GAP - ch, left, width, arrow: { side, offset: arrowX(left) } };
    }
    case "right": {
      const top = clamp(cy - ch / 2, MARGIN, vh - ch - MARGIN);
      return { top, left: s.right + GAP, width, arrow: { side, offset: clamp(cy - top, 18, ch - 18) } };
    }
    case "left": {
      const top = clamp(cy - ch / 2, MARGIN, vh - ch - MARGIN);
      return { top, left: s.left - GAP - width, width, arrow: { side, offset: clamp(cy - top, 18, ch - 18) } };
    }
    default:
      return { top: Math.max(MARGIN, vh - ch - MARGIN), left: (vw - width) / 2, width, arrow: null };
  }
}

// The little pointer on the callout's edge, facing the ring. `side` is where
// the callout sits relative to the ring.
function arrowStyle(side: Side, offset: number): React.CSSProperties {
  const half = ARROW / 2;
  switch (side) {
    case "bottom":
      return { top: -half - 1, left: offset - half, borderRight: "none", borderBottom: "none" };
    case "top":
      return { bottom: -half - 1, left: offset - half, borderLeft: "none", borderTop: "none" };
    case "right":
      return { left: -half - 1, top: offset - half, borderRight: "none", borderTop: "none" };
    case "left":
      return { right: -half - 1, top: offset - half, borderLeft: "none", borderBottom: "none" };
  }
}
