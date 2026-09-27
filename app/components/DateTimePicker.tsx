"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "./icons";

// On-brand date + time picker replacing the native <input type="datetime-local">
// (whose calendar is off-theme and whose time scroller is painful). Value is the
// same "YYYY-MM-DDTHH:mm" string the native input used, so it's a drop-in.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad2 = (n: number) => String(n).padStart(2, "0");

interface Parsed {
  y: number;
  m: number; // 0-11
  d: number;
  h: number; // 0-23
  min: number;
}

function parseValue(v: string): Parsed | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]) - 1,
    d: Number(match[3]),
    h: Number(match[4]),
    min: Number(match[5]),
  };
}

function buildValue(p: { y: number; m: number; d: number; h: number; min: number }): string {
  return `${p.y}-${pad2(p.m + 1)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.min)}`;
}

function formatDisplay(p: Parsed): string {
  const dow = WEEKDAYS_LONG[new Date(p.y, p.m, p.d).getDay()];
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const ampm = p.h < 12 ? "AM" : "PM";
  return `${dow}, ${MONTHS_SHORT[p.m]} ${p.d}, ${p.y} · ${h12}:${pad2(p.min)} ${ampm}`;
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--gw-fg-muted)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const selectStyle: React.CSSProperties = {
  height: 38,
  padding: "0 8px",
  borderRadius: 8,
  border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)",
  color: "var(--gw-fg)",
  fontSize: 14,
  fontWeight: 600,
};

export function DateTimePicker({
  label,
  value,
  onChange,
  required,
  placeholder = "Pick a date & time",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const parsed = parseValue(value);

  const today = new Date();
  const [view, setView] = useState<{ y: number; m: number }>(
    parsed ? { y: parsed.y, m: parsed.m } : { y: today.getFullYear(), m: today.getMonth() }
  );

  // Keep the visible month synced when the value changes from outside / on open.
  useEffect(() => {
    if (open && parsed) setView({ y: parsed.y, m: parsed.m });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Current time parts, defaulting sensibly when only one half is set.
  const h = parsed?.h ?? 9;
  const min = parsed?.min ?? 0;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm: "AM" | "PM" = h < 12 ? "AM" : "PM";

  function commit(next: { y: number; m: number; d: number; h: number; min: number }) {
    onChange(buildValue(next));
  }

  function pickDay(d: number) {
    commit({ y: view.y, m: view.m, d, h: parsed?.h ?? 9, min: parsed?.min ?? 0 });
  }

  function setTime(nextH: number, nextMin: number) {
    const base = parsed ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
    commit({ y: base.y, m: base.m, d: base.d, h: nextH, min: nextMin });
  }

  function to24(h12: number, ap: "AM" | "PM"): number {
    if (ap === "AM") return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  }

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  // Minute options: 5-min steps, plus the current minute if it's off-step.
  const minuteOpts = Array.from({ length: 12 }, (_, i) => i * 5);
  if (!minuteOpts.includes(min)) minuteOpts.push(min);
  minuteOpts.sort((a, b) => a - b);

  const cell: React.CSSProperties = {
    aspectRatio: "1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--gw-fg)",
    cursor: "pointer",
  };
  const navBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--gw-border)",
    background: "var(--gw-bg)",
    color: "var(--gw-fg)",
    cursor: "pointer",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          height: 42,
          padding: "0 14px",
          borderRadius: 8,
          border: `1px solid ${open ? "var(--rsd-accent)" : "var(--gw-border)"}`,
          background: "var(--gw-bg)",
          color: parsed ? "var(--gw-fg)" : "var(--gw-fg-muted)",
          fontSize: 14,
          fontWeight: parsed ? 600 : 400,
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          cursor: "pointer",
          width: "100%",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {parsed ? formatDisplay(parsed) : placeholder}
        </span>
        <Icons.Calendar width={16} height={16} />
      </button>
      {/* Hidden field so native required validation still works on submit. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value={value}
          onChange={() => {}}
          style={{ position: "absolute", opacity: 0, height: 0, width: 0, bottom: 0, pointerEvents: "none" }}
        />
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 6,
            zIndex: 50,
            width: 300,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>
              {MONTHS[view.m]} {view.y}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" aria-label="Previous month" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))} style={navBtn}>
                <Icons.ChevronLeft width={15} height={15} />
              </button>
              <button type="button" aria-label="Next month" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))} style={navBtn}>
                <Icons.ChevronRight width={15} height={15} />
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {WEEKDAYS.map((w, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const selected = !!parsed && parsed.y === view.y && parsed.m === view.m && parsed.d === d;
              const isToday = view.y === todayY && view.m === todayM && d === todayD;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  className="gw-press"
                  style={{
                    ...cell,
                    background: selected ? "var(--rsd-accent-fill)" : "transparent",
                    color: selected ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
                    border: !selected && isToday ? "1px solid var(--rsd-accent)" : "1px solid transparent",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* Time row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, borderTop: "1px solid var(--gw-border)", paddingTop: 12 }}>
            <Icons.Clock width={15} height={15} />
            <select
              aria-label="Hour"
              value={hour12}
              onChange={(e) => setTime(to24(Number(e.target.value), ampm), min)}
              style={{ ...selectStyle, flex: 1 }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((hh) => (
                <option key={hh} value={hh}>{hh}</option>
              ))}
            </select>
            <span style={{ fontWeight: 800, color: "var(--gw-fg-muted)" }}>:</span>
            <select
              aria-label="Minute"
              value={min}
              onChange={(e) => setTime(h, Number(e.target.value))}
              style={{ ...selectStyle, flex: 1 }}
            >
              {minuteOpts.map((mm) => (
                <option key={mm} value={mm}>{pad2(mm)}</option>
              ))}
            </select>
            <select
              aria-label="AM or PM"
              value={ampm}
              onChange={(e) => setTime(to24(hour12, e.target.value as "AM" | "PM"), min)}
              style={{ ...selectStyle, flex: 1 }}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{ background: "none", border: "none", color: "var(--gw-fg-muted)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ padding: "7px 16px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)", border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
