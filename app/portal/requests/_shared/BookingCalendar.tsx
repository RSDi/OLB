"use client";
import { useEffect, useState } from "react";
import { Icons } from "../../../components/icons";
import { loadBusyWindows } from "../../../../lib/requests/availability-actions";
import {
  freeStartMinutes,
  maxDurationMinutes,
  allowedDurations,
  minutesTo12h,
  minutesToHHMM,
  hhmmToMinutes,
  durationLabel,
  OPEN_MIN,
  CLOSE_MIN,
  SLOT_MIN,
  type BusyWindow,
} from "../../../../lib/requests/availability";

// Availability-aware date+time picker. Shows the months calendar, then the
// free start times for the chosen day (existing reservations for the space are
// hidden), then an elegant duration choice capped by the next booking. Writes
// the same form fields the old inputs did — date / startTime / endTime
// (YYYY-MM-DD, HH:MM) — so the conflict checker + calendar booker are unchanged.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DURATION_PRESETS = [60, 120, 180]; // 1 hr / 2 hr / 3 hr
const str = (v: unknown) => (typeof v === "string" ? v : "");
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function BookingCalendar({
  form,
  set,
  spaces,
}: {
  form: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  spaces: string[];
}) {
  const now = new Date();
  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const selectedDate = str(form.date);
  const startMin = hhmmToMinutes(str(form.startTime));
  const endMin = hhmmToMinutes(str(form.endTime));

  const [view, setView] = useState(() => {
    if (selectedDate) {
      const [y, m] = selectedDate.split("-").map(Number);
      return { y, m: m - 1 };
    }
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [busy, setBusy] = useState<Record<string, BusyWindow[]>>({});
  const [loading, setLoading] = useState(false);

  const spacesKey = spaces.join(",");
  useEffect(() => {
    if (spaces.length === 0) return;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const from = ymd(view.y, view.m, 1);
    const to = ymd(view.y, view.m, days);
    let live = true;
    setLoading(true);
    loadBusyWindows(spaces, from, to)
      .then((b) => { if (live) setBusy(b); })
      .catch(() => { if (live) setBusy({}); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [view.y, view.m, spacesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const isCurrentOrLater =
    view.y > now.getFullYear() || (view.y === now.getFullYear() && view.m >= now.getMonth());

  function pickDay(d: number) {
    const date = ymd(view.y, view.m, d);
    set("date", date);
    set("startTime", "");
    set("endTime", "");
  }
  function pickStart(min: number) {
    set("startTime", minutesToHHMM(min));
    set("endTime", "");
  }
  function pickEnd(min: number) {
    set("endTime", minutesToHHMM(min));
  }

  // Free starts for the selected day (drop past times if it's today).
  const dayBusy = selectedDate ? busy[selectedDate] ?? [] : [];
  let starts = selectedDate ? freeStartMinutes(dayBusy, OPEN_MIN, CLOSE_MIN, SLOT_MIN) : [];
  if (selectedDate === todayStr) starts = starts.filter((m) => m >= nowMin);

  const maxDur = startMin != null ? maxDurationMinutes(startMin, dayBusy, CLOSE_MIN) : 0;
  const presets = startMin != null ? allowedDurations(startMin, dayBusy, DURATION_PRESETS, CLOSE_MIN) : [];

  const cell: React.CSSProperties = {
    aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 10, fontSize: 14, fontWeight: 600, border: "1px solid transparent",
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      {/* ── Calendar ── */}
      <div style={{ flex: "1 1 280px", minWidth: 260 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>
            {MONTHS[view.m]} {view.y}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              aria-label="Previous month"
              disabled={isCurrentOrLater === true && view.y === now.getFullYear() && view.m <= now.getMonth()}
              onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}
              className="gw-press"
              style={{ ...navBtn, opacity: view.y === now.getFullYear() && view.m <= now.getMonth() ? 0.35 : 1, cursor: view.y === now.getFullYear() && view.m <= now.getMonth() ? "not-allowed" : "pointer" }}
            >
              <Icons.ChevronLeft width={16} height={16} />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}
              className="gw-press"
              style={navBtn}
            >
              <Icons.ChevronRight width={16} height={16} />
            </button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", padding: "4px 0" }}>
              {w}
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const date = ymd(view.y, view.m, d);
            const past = date < todayStr;
            const fullyBooked = !past && (busy[date] ? freeStartMinutes(busy[date], OPEN_MIN, CLOSE_MIN, SLOT_MIN).length === 0 : false);
            const selected = date === selectedDate;
            const disabled = past || fullyBooked;
            return (
              <button
                key={d}
                type="button"
                disabled={disabled}
                onClick={() => pickDay(d)}
                className={disabled ? undefined : "gw-press"}
                style={{
                  ...cell,
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: selected ? "var(--rsd-accent)" : "transparent",
                  color: selected ? "var(--rsd-accent-on)" : past ? "var(--gw-fg-muted)" : "var(--gw-fg)",
                  opacity: past ? 0.3 : fullyBooked ? 0.4 : 1,
                  textDecoration: fullyBooked ? "line-through" : "none",
                  border: !selected && date === todayStr ? "1px solid var(--rsd-accent)" : "1px solid transparent",
                }}
                title={fullyBooked ? "Fully booked" : undefined}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Times ── */}
      <div style={{ flex: "1 1 240px", minWidth: 220, display: "flex", flexDirection: "column", gap: 10 }}>
        {!selectedDate ? (
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6, paddingTop: 28 }}>
            Pick a date to see the times that are open{spaces.length ? ` for the ${spaces.join(" + ")}` : ""}.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
              {new Date(view.y, view.m, Number(selectedDate.split("-")[2])).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Checking availability…</div>
            ) : startMin == null ? (
              starts.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
                  No open times that day — it&rsquo;s fully booked. Try another date.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)" }}>Start time</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, maxHeight: 280, overflowY: "auto" }}>
                    {starts.map((m) => (
                      <button key={m} type="button" onClick={() => pickStart(m)} className="gw-press" style={slotBtn}>
                        {minutesTo12h(m)}
                      </button>
                    ))}
                  </div>
                </>
              )
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ fontWeight: 700 }}>Starts {minutesTo12h(startMin)}</span>
                  <button type="button" onClick={() => { set("startTime", ""); set("endTime", ""); }} style={{ background: "none", border: "none", color: "var(--rsd-accent)", fontWeight: 600, fontSize: 12.5, cursor: "pointer" }}>
                    change
                  </button>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)" }}>How long?</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {presets.map((dur) => {
                    const selected = endMin === startMin + dur;
                    return (
                      <button key={dur} type="button" onClick={() => pickEnd(startMin + dur)} className="gw-press" style={chip(selected)}>
                        {durationLabel(dur)}
                      </button>
                    );
                  })}
                  {maxDur > 0 && !presets.includes(maxDur) && (
                    <button type="button" onClick={() => pickEnd(startMin + maxDur)} className="gw-press" style={chip(endMin === startMin + maxDur)}>
                      Rest of day
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 12.5, color: "var(--gw-fg-muted)" }}>or end at</span>
                  <input
                    type="time"
                    value={endMin != null ? minutesToHHMM(endMin) : ""}
                    onChange={(e) => {
                      const m = hhmmToMinutes(e.target.value);
                      if (m == null) return;
                      // Clamp into the free window so the form never holds an
                      // overlapping end: at least one slot, at most rest-of-day.
                      pickEnd(Math.min(Math.max(m, startMin + SLOT_MIN), startMin + maxDur));
                    }}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13 }}
                  />
                </div>
                {endMin != null && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-success, #16a34a)", marginTop: 2 }}>
                    {minutesTo12h(startMin)} – {minutesTo12h(endMin)} · {durationLabel(endMin - startMin)}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--gw-border)",
  background: "var(--gw-bg)", color: "var(--gw-fg)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer",
};
const slotBtn: React.CSSProperties = {
  padding: "9px 6px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer",
  background: "var(--gw-bg)", color: "var(--rsd-accent)", border: "1px solid var(--rsd-accent)",
};
const chip = (selected: boolean): React.CSSProperties => ({
  padding: "9px 14px", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer",
  background: selected ? "var(--rsd-accent)" : "var(--gw-bg)",
  color: selected ? "var(--rsd-accent-on)" : "var(--gw-fg)",
  border: `1px solid ${selected ? "var(--rsd-accent)" : "var(--gw-border)"}`,
});
