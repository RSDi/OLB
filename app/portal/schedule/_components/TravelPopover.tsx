"use client";
// Where to stay and eat on a weekend away: the hotels and places to eat in
// External Contacts near the weekend's place (lib/hs-schedule/travel.ts),
// each with its notes (rates, what worked last time), who to call and its
// website. Opens from the bed and fork counts under the weekend's Where; a
// sheet from the bottom on a phone.

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import { formatWeekendDates } from "../../../../lib/hs-schedule/logic";
import type { HsWeekend } from "../../../../lib/hs-schedule/types";
import type { PlacesNear, TravelPlace } from "../../../../lib/hs-schedule/travel";
import { externalHref, telHref } from "../../contacts/_shared/format";

const WIDTH = 384;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summary(near: PlacesNear): string {
  return [
    near.hotels.length ? plural(near.hotels.length, "hotel", "hotels") : null,
    near.food.length ? plural(near.food.length, "place to eat", "places to eat") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

// "🛏 3 🍴 1" under the weekend's Where.
export function TravelChip({ near, active, onOpen }: { near: PlacesNear; active: boolean; onOpen: (el: HTMLElement) => void }) {
  const text = summary(near);
  return (
    <button
      type="button"
      data-tour="schedule-travel"
      aria-label={`Where to stay and eat near ${near.city}: ${text}`}
      aria-expanded={active}
      title={`Where to stay and eat: ${text}`}
      onClick={(e) => onOpen(e.currentTarget)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 9px",
        borderRadius: 100,
        border: `1px solid ${active ? "var(--rsd-accent-fill)" : "var(--gw-border)"}`,
        background: active ? "var(--rsd-accent-bg)" : "var(--gw-bg-elev)",
        color: "var(--gw-fg)",
        fontSize: 11.5,
        fontWeight: 800,
        cursor: "pointer",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {near.hotels.length > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icons.Bed width={13} height={13} /> {near.hotels.length}
        </span>
      )}
      {near.food.length > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icons.Utensils width={12} height={12} /> {near.food.length}
        </span>
      )}
    </button>
  );
}

export function TravelPopover({
  weekend,
  near,
  anchor,
  onClose,
}: {
  weekend: HsWeekend;
  near: PlacesNear;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number; sheet: boolean } | null>(null);

  // Under the counts, or above them when it fits there and not below. When
  // it fits neither, it takes the side with more room and scrolls, so the
  // counts stay in sight. A sheet along the bottom on a phone.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const body = bodyRef.current;
      if (!el || !body) return;
      if (window.innerWidth < 640) {
        setPos({ top: 0, left: 0, maxHeight: 0, sheet: true });
        return;
      }
      const r = anchor.getBoundingClientRect();
      // Its full height, however much of it shows now.
      const natural = el.offsetHeight - body.clientHeight + body.scrollHeight;
      const roomBelow = window.innerHeight - r.bottom - 14;
      const roomAbove = r.top - 14;
      const cap = 640;
      let top: number;
      let maxHeight: number;
      if (natural <= roomBelow || (natural > roomAbove && roomBelow >= roomAbove && roomBelow >= 240)) {
        maxHeight = Math.min(roomBelow, cap);
        top = r.bottom + 6;
      } else if (natural <= roomAbove || roomAbove >= 240) {
        maxHeight = Math.min(roomAbove, cap);
        top = r.top - 6 - Math.min(natural, maxHeight);
      } else {
        maxHeight = window.innerHeight - 16;
        top = 8;
      }
      const left = Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8);
      setPos({ top, left, maxHeight, sheet: false });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, near]);

  // Escape, or a click outside, closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.contains(t)) return;
      // The guided tour's Next / Back, while it points at this card.
      if (t instanceof Element && t.closest("[data-guided-tour]")) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [anchor, onClose]);

  const sheet = pos?.sheet ?? false;
  const style: CSSProperties = sheet
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "82vh", borderRadius: "16px 16px 0 0" }
    : {
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: WIDTH,
        maxHeight: pos?.maxHeight ?? "min(640px, calc(100vh - 16px))",
        borderRadius: 14,
      };

  return createPortal(
    <>
      {sheet && (
        <div aria-hidden onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(11,11,12,.3)", zIndex: 79 }} />
      )}
      <div
        ref={ref}
        role="dialog"
        aria-label={`Where to stay and eat near ${near.city}`}
        data-tour="schedule-travel-card"
        style={{
          ...style,
          zIndex: 80,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          boxShadow: "0 18px 44px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--gw-border)", display: "flex", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
              {formatWeekendDates(weekend.starts_on, weekend.ends_on)} · {weekend.event || "Weekend"}
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>Where to stay and eat near {near.city}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={closeBtn}>
            <Icons.X width={14} height={14} />
          </button>
        </div>

        <div ref={bodyRef} style={{ overflowY: "auto", padding: "4px 14px 12px", display: "flex", flexDirection: "column" }}>
          {near.hotels.length > 0 && <Section title="Hotels" icon={<Icons.Bed width={13} height={13} />} places={near.hotels} />}
          {near.food.length > 0 && <Section title="Places to eat" icon={<Icons.Utensils width={12} height={12} />} places={near.food} />}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "space-between",
            alignItems: "center",
            padding: "8px 14px",
            borderTop: "1px solid var(--gw-border)",
            background: "var(--gw-bg)",
            fontSize: 11.5,
            color: "var(--gw-fg-muted)",
            fontWeight: 600,
          }}
        >
          <span>From External Contacts</span>
          <Link href="/portal/contacts" style={{ color: "var(--gw-fg)", fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
            Open <Icons.ChevronRight width={12} height={12} />
          </Link>
        </div>
      </div>
    </>,
    document.body
  );
}

function Section({ title, icon, places }: { title: string; icon: React.ReactNode; places: TravelPlace[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", paddingTop: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--gw-fg-muted)",
        }}
      >
        {icon} {title} ({places.length})
      </div>
      {places.map((p, i) => (
        <PlaceItem key={p.id} place={p} first={i === 0} />
      ))}
    </div>
  );
}

function PlaceItem({ place, first }: { place: TravelPlace; first: boolean }) {
  const where = [place.city, place.state].filter(Boolean).join(", ");
  const site = externalHref(place.website);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 0", borderTop: first ? "none" : "1px solid var(--gw-border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <Link href={`/portal/contacts/${place.id}`} style={{ fontSize: 13.5, fontWeight: 800, color: "var(--gw-fg)", textDecoration: "none" }}>
          {place.name}
        </Link>
        {where && <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{where}</span>}
        {site && (
          <a
            href={site}
            target="_blank"
            rel="noopener noreferrer"
            style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "var(--gw-fg)", display: "inline-flex", alignItems: "center", gap: 3 }}
          >
            Website <Icons.ExternalLink width={11} height={11} />
          </a>
        )}
      </div>
      {place.notes && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--gw-fg)", overflowWrap: "anywhere" }}>{place.notes}</div>
      )}
      {place.people.length > 0
        ? place.people.map((person) => (
            <Reach key={person.id} name={person.name} title={person.title} phone={person.phone ?? person.mobile_phone} email={person.email} />
          ))
        : (place.phone || place.email) && <Reach name={null} title={null} phone={place.phone} email={place.email} />}
    </div>
  );
}

// Who to call there: a name, then tap-to-call and tap-to-email.
function Reach({ name, title, phone, email }: { name: string | null; title: string | null; phone: string | null; email: string | null }) {
  const tel = telHref(phone);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "3px 12px", fontSize: 12 }}>
      {name && (
        <span style={{ fontWeight: 700 }}>
          {name}
          {title && <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}> · {title}</span>}
        </span>
      )}
      {phone &&
        (tel ? (
          <a href={tel} style={reachLink}>
            <Icons.Phone width={11} height={11} /> {phone}
          </a>
        ) : (
          <span>{phone}</span>
        ))}
      {email && (
        <a href={`mailto:${email}`} style={{ ...reachLink, overflowWrap: "anywhere" }}>
          <Icons.Mail width={11} height={11} /> {email}
        </a>
      )}
    </div>
  );
}

const reachLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  color: "var(--gw-fg)",
  fontWeight: 600,
  textDecoration: "none",
};

const closeBtn: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)",
  color: "var(--gw-fg-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
};
