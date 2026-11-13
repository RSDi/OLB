"use client";
// Settings → Website Activity: busy times (weekday × hour) for the club
// website, and the Missouri River Shootout's pages (migration 0166). One hue,
// light to dark: the darker the square, the more people in that hour.

import { useMemo, useState } from "react";
import { KpiCard } from "../../components/ui";
import type { AreaTotals, WebsiteActivity } from "../../../lib/activity/website-queries";
import { fmtDay } from "../../../lib/activity/paths";

const muted = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 } as const;
const HUE = "#A67C00";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

export function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "Noon";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      <div style={muted}>{sub}</div>
    </div>
  );
}

type Cell = { value: number; label: string };

// Rows × 24 hours. Hover or focus a square to read it in the line above.
function HeatGrid({ rows, idle, ariaLabel }: { rows: { name: string; cells: Cell[] }[]; idle: string; ariaLabel: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...muted, fontVariantNumeric: "tabular-nums", minHeight: 18 }} aria-live="polite">
        {hover ?? idle}
      </div>
      <div style={{ overflowX: "auto" }}>
        <div role="table" aria-label={ariaLabel} style={{ display: "grid", gridTemplateColumns: "44px repeat(24, minmax(14px, 1fr))", gap: 2, minWidth: 420 }}
          onMouseLeave={() => setHover(null)}>
          {rows.map((r) => (
            <div role="row" key={r.name} style={{ display: "contents" }}>
              <div role="rowheader" style={{ ...muted, fontWeight: 600, alignSelf: "center" }}>{r.name}</div>
              {r.cells.map((c, h) => (
                <div
                  role="cell"
                  key={h}
                  tabIndex={0}
                  aria-label={c.label}
                  onMouseEnter={() => setHover(c.label)}
                  onFocus={() => setHover(c.label)}
                  onBlur={() => setHover(null)}
                  style={{
                    height: 20,
                    borderRadius: 4,
                    outline: "none",
                    background: c.value
                      ? `color-mix(in srgb, ${HUE} ${Math.round(15 + (c.value / max) * 85)}%, var(--gw-bg))`
                      : "var(--gw-bg)",
                    border: hover === c.label ? "1px solid var(--gw-fg)" : "1px solid var(--gw-border)",
                  }}
                />
              ))}
            </div>
          ))}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ ...muted, fontWeight: 500, fontSize: 10, textAlign: "left", whiteSpace: "nowrap" }}>
              {h % 3 === 0 ? hourLabel(h).replace(" ", "") : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BusyTimes({ busy }: { busy: WebsiteActivity["busy"] }) {
  const { rows, peak } = useMemo(() => {
    const rows = WEEKDAYS.map((name, w) => ({
      name,
      cells: busy.visitors[w].map((n, h) => ({
        value: n,
        label: `${WEEKDAYS_LONG[w]} ${hourLabel(h)}: ${people(n)}, ${busy.views[w][h]} page views`,
      })),
    }));
    const all = busy.visitors.flatMap((hours, w) => hours.map((n, h) => ({ w, h, n })));
    const top = all.reduce((a, b) => (b.n > a.n ? b : a), all[0]);
    return { rows, peak: top && top.n > 0 ? top : null };
  }, [busy]);
  return (
    <div className="rsd-card" data-tour="website-activity-busy">
      <CardHead title="Busy times" sub="When people visit the club website, by weekday and hour (Central), last 30 days. Shootout pages aren't included." />
      <HeatGrid
        rows={rows}
        ariaLabel="Club website visitors by weekday and hour"
        idle={peak ? `Busiest: ${WEEKDAYS_LONG[peak.w]} around ${hourLabel(peak.h)} · ${people(peak.n)} over the month` : "No visits yet"}
      />
    </div>
  );
}

function share(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

export function Shootout({ shootout }: { shootout: WebsiteActivity["shootout"] }) {
  const fans: AreaTotals | undefined = shootout.areas.shootout;
  const tv = shootout.areas.shootout_tv;
  const score = shootout.areas.shootout_score;
  const signs = shootout.areas.shootout_signs;

  const { rows, peak } = useMemo(() => {
    const days = [...new Set(shootout.hourly.map((r) => r.day))].sort();
    const byKey = new Map(shootout.hourly.map((r) => [`${r.day} ${r.hour}`, r]));
    const rows = days.map((day) => {
      const dow = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
      return {
        name: dow,
        cells: Array.from({ length: 24 }, (_, h) => {
          const r = byKey.get(`${day} ${h}`);
          const n = r?.visitors ?? 0;
          return { value: n, label: `${dow} ${fmtDay(day)}, ${hourLabel(h)}: ${people(n)}, ${r?.views ?? 0} page views` };
        }),
      };
    });
    const top = shootout.hourly.reduce<(typeof shootout.hourly)[number] | null>((a, b) => (!a || b.visitors > a.visitors ? b : a), null);
    return { rows, peak: top && top.visitors > 0 ? { day: top.day, h: top.hour, n: top.visitors } : null };
  }, [shootout]);

  const pages: { name: string; what: string; t?: AreaTotals }[] = [
    { name: "Live scores", what: "/shootout, from the QR signs", t: fans },
    { name: "TV screens", what: "The scoreboards and admission screen in the gym", t: tv },
    { name: "Scorer's tables", what: "Where finals are entered", t: score },
    { name: "Signs", what: "The printable QR signs", t: signs },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rsd-gap)" }} data-tour="website-activity-shootout">
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Missouri River Shootout</h2>
        <div style={muted}>The live scores page and the gym&apos;s screens, last 60 days</div>
      </div>
      <div className="rsd-kpi-grid">
        <KpiCard label="People on live scores" value={fans?.visitors ?? 0} sub="Different phones and computers" accent />
        <KpiCard label="Live scores page views" value={fans?.views ?? 0} sub={fans ? `${fans.visits} visits` : undefined} />
        <KpiCard label="On a phone" value={share(fans?.phones ?? 0, fans?.visitors ?? 0)} sub="Of people on live scores" />
        <KpiCard label="Came back" value={fans && fans.visitors ? (fans.visits / fans.visitors).toFixed(1) : "—"} sub="Visits per person" />
      </div>
      <div className="rsd-card">
        <CardHead title="Busy times on live scores" sub="People on the live scores page each hour (Central), on each day it had visitors" />
        {rows.length === 0 ? (
          <div style={muted}>Nobody has opened the live scores page in the last 60 days.</div>
        ) : (
          <HeatGrid
            rows={rows}
            ariaLabel="Live scores visitors by day and hour"
            idle={peak ? `Busiest: ${fmtDay(peak.day)} around ${hourLabel(peak.h)} · ${people(peak.n)}` : ""}
          />
        )}
      </div>
      <div className="rsd-card">
        <CardHead title="Shootout pages" sub="Each TV, scorer's laptop or phone counts once as a device" />
        <table className="rsd-tbl">
          <thead>
            <tr>
              <th>Page</th>
              <th className="num">Devices</th>
              <th className="num">Page views</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.name}>
                <td>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ ...muted, fontWeight: 500, display: "block" }}>{p.what}</span>
                </td>
                <td className="num">{p.t?.visitors ?? 0}</td>
                <td className="num">{p.t?.views ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
