"use client";
// An address you can tap to open in a map app. Tapping it pops up a small
// menu with "Apple Maps" and "Google Maps"; each opens a new tab (or the app,
// on a phone). The menu is portaled to <body> so a card's overflow can't clip
// it, and closes on a tap outside, Escape, scrolling or resizing.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icons } from "./icons";
import { appleMapsUrl, googleMapsUrl } from "../../lib/maps/links";

const WIDTH = 184;

export function MapLink({
  address,
  icon,
  style,
}: {
  address: string;
  // Shown before the address, usually a map pin.
  icon?: ReactNode;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Below the address, or above it when there's no room below. Placed
  // before the browser paints, so it never shows where it last was.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current;
      const m = menuRef.current;
      if (!a || !m) return;
      const r = a.getBoundingClientRect();
      const h = m.offsetHeight;
      const below = r.bottom + 6 + h <= window.innerHeight - 8 || r.top - 6 - h < 8;
      const top = below ? r.bottom + 6 : r.top - 6 - h;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8);
      setPos({ top, left });
    };
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      anchorRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Once it's placed (a hidden menu can't take focus), so the keyboard can
  // Tab through the two apps.
  useEffect(() => {
    if (open && pos) menuRef.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, [open, pos]);

  const item: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--gw-fg)",
    textDecoration: "none",
  };

  const menu = open && (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Open ${address} in a map`}
      style={{
        position: "fixed",
        zIndex: 90,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
        width: WIDTH,
        background: "var(--gw-bg-elev)",
        border: "1px solid var(--gw-border)",
        borderRadius: 10,
        boxShadow: "0 12px 28px rgba(0,0,0,.14)",
        padding: 4,
        boxSizing: "border-box",
        textAlign: "left",
      }}
    >
      <div
        style={{
          padding: "6px 10px 3px",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--gw-fg-muted)",
        }}
      >
        Open in
      </div>
      {[
        { label: "Apple Maps", href: appleMapsUrl(address) },
        { label: "Google Maps", href: googleMapsUrl(address) },
      ].map((o) => (
        <a
          key={o.label}
          role="menuitem"
          href={o.href}
          target="_blank"
          rel="noreferrer noopener"
          className="rsd-map-link-item"
          onClick={() => setOpen(false)}
          style={item}
        >
          {o.label}
          <Icons.ExternalLink width={12} height={12} style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }} />
        </a>
      ))}
    </div>
  );

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="rsd-map-link"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Open in Apple Maps or Google Maps"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          font: "inherit",
          color: "inherit",
          textAlign: "left",
          cursor: "pointer",
          ...style,
        }}
      >
        {icon}
        <span className="rsd-map-link-text">{address}</span>
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
