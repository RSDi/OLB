"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";

// Small month-grid popover, same visual pattern as
// app/portal/requests/_shared/BookingCalendar.tsx (weekday header, prev/next
// month nav, day grid) but without any of that component's booking-specific
// logic — only days with archived messages are clickable.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function DateJumpCalendar({
  dates,
  onSelect,
}: {
  dates: string[]; // ISO YYYY-MM-DD, the days that have at least one message
  onSelect: (date: string) => void;
}) {
  const dateSet = new Set(dates);
  const sorted = [...dates].sort();
  const latest = sorted[sorted.length - 1];

  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    if (latest) {
      const [y, m] = latest.split("-").map(Number);
      return { y, m: m - 1 };
    }
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = new Date(view.y, view.m, 1).getDay();

  function pick(date: string) {
    onSelect(date);
    setOpen(false);
  }

  const cell: React.CSSProperties = {
    aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, fontSize: 13, fontWeight: 600, border: "1px solid transparent",
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <Pill variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        <Icons.Calendar width={14} height={14} /> Jump to date
      </Pill>

      {open && (
        <div
          className="rsd-card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20,
            width: 260, padding: 14, boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--gw-fg)" }}>
              {MONTHS[view.m]} {view.y}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
                className="gw-press"
                style={navBtn}
              >
                <Icons.ChevronLeft width={14} height={14} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
                className="gw-press"
                style={navBtn}
              >
                <Icons.ChevronRight width={14} height={14} />
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
            {WEEKDAYS.map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--gw-fg-muted)", padding: "2px 0" }}>
                {w}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const date = ymd(view.y, view.m, d);
              const hasMessages = dateSet.has(date);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!hasMessages}
                  onClick={() => pick(date)}
                  className={hasMessages ? "gw-press" : undefined}
                  style={{
                    ...cell,
                    cursor: hasMessages ? "pointer" : "default",
                    background: hasMessages ? "var(--gw-bg-elev)" : "transparent",
                    color: hasMessages ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                    opacity: hasMessages ? 1 : 0.3,
                    border: hasMessages ? "1px solid var(--rsd-accent)" : "1px solid transparent",
                  }}
                  title={hasMessages ? "Jump to this day" : undefined}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 24, height: 24, borderRadius: 6, border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)", color: "var(--gw-fg)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
};
