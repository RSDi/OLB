"use client";
// Settings → Website Activity (super-admins on the staged-rollout list): who
// is visiting the public club website, where they came from, the pages they
// go to and how far they get with player registration. Visitors are
// anonymous until they sign in to the portal or register players.

import { useEffect, useMemo, useState } from "react";
import { KpiCard } from "../../components/ui";
import { fetchWebsiteActivity } from "./website-activity-actions";
import type { WebsiteActivity, WebsiteVisit } from "../../../lib/activity/website-queries";
import { sitePageLabel } from "../../../lib/activity/website-rules";
import { fmtDateTime, fmtDay, fmtDuration, lastDays, relTime } from "../../../lib/activity/paths";

const muted = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 } as const;
const BAR = "#A67C00";
const BAR_HOVER = "#7A5B00";

const DEVICE_LABELS: Record<string, string> = { phone: "Phone", tablet: "Tablet", computer: "Computer" };

function Chip({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "ok" | "warn" }) {
  const tones = {
    mute: { background: "var(--gw-bg)", color: "var(--gw-fg-muted)", border: "var(--gw-border)" },
    warn: { background: "#FEF3C7", color: "#7A4B00", border: "#F5D48A" },
    ok: { background: "var(--gw-success-bg)", color: "var(--gw-success)", border: "transparent" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        background: tones.background,
        color: tones.color,
        border: `1px solid ${tones.border}`,
      }}
    >
      {children}
    </span>
  );
}

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
      <div style={muted}>{sub}</div>
    </div>
  );
}

// Visitors each day, last 30 days. One series, so no legend: the title names it.
function DailyChart({ daily, now }: { daily: WebsiteActivity["daily"]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const byDay = new Map(daily.map((d) => [d.day, d]));
    return lastDays(30, now).map((day) => ({
      day,
      visitors: byDay.get(day)?.visitors ?? 0,
      views: byDay.get(day)?.views ?? 0,
    }));
  }, [daily, now]);
  const max = Math.max(1, ...days.map((d) => d.visitors));
  const peak = days.reduce((a, b) => (b.visitors > a.visitors ? b : a), days[0]);
  const shown = hover !== null ? days[hover] : null;
  const people = (n: number) => `${n} ${n === 1 ? "visitor" : "visitors"}`;

  return (
    <div className="rsd-card" data-tour="website-activity-daily">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <CardHead title="Visitors each day" sub="People who opened the club website, last 30 days" />
        <div style={{ ...muted, fontVariantNumeric: "tabular-nums" }} aria-live="polite">
          {shown
            ? `${fmtDay(shown.day)} · ${people(shown.visitors)} · ${shown.views} page views`
            : peak.visitors > 0
            ? `Busiest: ${fmtDay(peak.day)} · ${people(peak.visitors)}`
            : "No visits yet"}
        </div>
      </div>
      <div
        role="list"
        aria-label="Visitors each day, last 30 days"
        style={{ display: "flex", alignItems: "stretch", gap: 2, height: 120, borderBottom: "1px solid var(--gw-border)" }}
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => (
          <div
            key={d.day}
            role="listitem"
            tabIndex={0}
            aria-label={`${fmtDay(d.day)}: ${people(d.visitors)}, ${d.views} page views`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{ flex: 1, display: "flex", alignItems: "flex-end", cursor: "default", outline: "none" }}
          >
            <div
              style={{
                width: "100%",
                height: d.visitors ? `${Math.max(3, (d.visitors / max) * 100)}%` : 0,
                background: hover === i ? BAR_HOVER : BAR,
                borderRadius: "4px 4px 0 0",
                transition: "background 120ms",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", ...muted, fontWeight: 500, marginTop: -8 }}>
        <span>{fmtDay(days[0].day)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}

// Player registration step by step: each bar is the share of the people who
// opened the registration page.
function Funnel({ funnel }: { funnel: WebsiteActivity["funnel"] }) {
  const steps = [
    { label: "Opened Player Registration", n: funnel.opened },
    { label: "Started (asked for an email code)", n: funnel.started },
    { label: "Registered", n: funnel.submitted },
  ];
  const base = Math.max(1, funnel.opened, funnel.started, funnel.submitted);
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }} data-tour="website-activity-funnel">
      <CardHead title="Player registration" sub="People at each step, last 30 days" />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((s, i) => {
          const pct = Math.round((s.n / base) * 100);
          return (
            <div key={s.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{s.label}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {s.n}
                  {i > 0 && funnel.opened > 0 && <span style={{ ...muted, fontWeight: 500 }}> · {pct}%</span>}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 100, background: "var(--gw-bg)", border: "1px solid var(--gw-border)" }}>
                <div style={{ width: `${s.n ? Math.max(2, pct) : 0}%`, height: "100%", borderRadius: 100, background: BAR }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: WebsiteActivity["sources"] }) {
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }} data-tour="website-activity-sources">
      <CardHead title="Where visitors came from" sub="Last 30 days · Direct is typed in, a bookmark or an app" />
      {sources.length === 0 ? (
        <div style={muted}>No visits recorded yet.</div>
      ) : (
        <table className="rsd-tbl">
          <thead>
            <tr>
              <th>From</th>
              <th className="num">Visits</th>
              <th className="num">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.source}>
                <td>{s.source}</td>
                <td className="num">{s.visits}</td>
                <td className="num">{s.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TopPages({ pages }: { pages: WebsiteActivity["topPages"] }) {
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }}>
      <CardHead title="Most visited pages" sub="Last 30 days" />
      {pages.length === 0 ? (
        <div style={muted}>No visits recorded yet.</div>
      ) : (
        <table className="rsd-tbl">
          <thead>
            <tr>
              <th>Page</th>
              <th className="num">Views</th>
              <th className="num">Visitors</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.page}>
                <td title={p.page}>{sitePageLabel(p.page)}</td>
                <td className="num">{p.views}</td>
                <td className="num">{p.visitors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Registrations({ regs, now }: { regs: WebsiteActivity["registrations"]; now: number }) {
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }}>
      <CardHead title="Recent registrations" sub="How each family found their way, last 30 days" />
      {regs.length === 0 ? (
        <div style={muted}>No registrations recorded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {regs.map((r) => (
            <div
              key={`${r.visitorId}-${r.at}`}
              style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 4px", borderBottom: "1px solid var(--gw-border)" }}
            >
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r.players || "Players"}</span>
                <span style={{ ...muted, fontWeight: 500 }}>
                  {r.visits} {r.visits === 1 ? "visit" : "visits"}
                  {r.firstSeenAt && r.visits > 1 && <> since {fmtDay(r.firstSeenAt.slice(0, 10))}</>}
                  {" · "}first came from {r.firstSource || "Direct"}
                </span>
              </span>
              <span style={{ ...muted, fontWeight: 500, flexShrink: 0 }} title={fmtDateTime(r.at)}>
                {relTime(r.at, now)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitRow({ v, now }: { v: WebsiteVisit; now: number }) {
  const who = v.memberName ?? (v.registeredAs ? `Registered ${v.registeredAs}` : null);
  const facts = [DEVICE_LABELS[v.device] ?? null, v.place || null, v.source ? `from ${v.source}` : "Direct"].filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 4px", borderBottom: "1px solid var(--gw-border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 14, fontWeight: 700 }}>
          <span title={fmtDateTime(v.startedAt)}>{relTime(v.startedAt, now)}</span>
          {who && <span style={{ fontWeight: 600 }}>· {who}</span>}
          {v.registered ? (
            <Chip tone="ok">Registered</Chip>
          ) : v.startedRegistration ? (
            <Chip tone="warn">Started registering</Chip>
          ) : null}
          {v.visitNumber > 1 && <Chip>Visit #{v.visitNumber}</Chip>}
        </span>
        <span style={{ ...muted, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          {v.pageViews} {v.pageViews === 1 ? "page" : "pages"} · {fmtDuration(Date.parse(v.lastAt) - Date.parse(v.startedAt))}
        </span>
      </div>
      <div style={{ ...muted, fontWeight: 500 }}>{facts.join(" · ")}</div>
      {v.pages.length > 0 && (
        <div style={{ fontSize: 13, lineHeight: 1.6, overflowWrap: "anywhere" }}>
          {v.pages.map((p, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: "var(--gw-fg-muted)" }}> → </span>}
              <span title={p}>{sitePageLabel(p)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentVisits({ visits, now }: { visits: WebsiteVisit[]; now: number }) {
  return (
    <div className="rsd-card" data-tour="website-activity-visits">
      <CardHead
        title="Recent visits"
        sub="The latest visits, page by page. A visit ends after 30 minutes away."
      />
      {visits.length === 0 ? (
        <div style={muted}>No visits recorded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {visits.map((v) => (
            <VisitRow key={v.visitId} v={v} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

export function WebsiteActivityTab() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: WebsiteActivity }
  >({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetchWebsiteActivity().then((r) => {
      if (!live) return;
      setState("error" in r ? { status: "error", error: r.error } : { status: "ok", data: r.data });
    });
    return () => {
      live = false;
    };
  }, []);

  const intro = (
    <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 620 }}>
      Who is visiting the public club website, where they came from and where they go. Visitors stay anonymous until
      they sign in to the portal or register players; then their visits carry their name.
    </div>
  );
  if (state.status === "loading")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {intro}
        <div style={muted}>Loading…</div>
      </div>
    );
  if (state.status === "error")
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {intro}
        <div style={{ ...muted, color: "var(--gw-error)" }}>{state.error}</div>
      </div>
    );

  const { data } = state;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rsd-gap)" }}>
      {intro}
      {data.error && (
        <div
          role="alert"
          style={{
            background: "var(--gw-error-bg)",
            color: "var(--gw-error)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {data.error}
        </div>
      )}
      <div className="rsd-kpi-grid" data-tour="website-activity-kpis">
        <KpiCard label="Visitors · 30 days" value={data.kpis.visitors30d} sub="Different browsers" />
        <KpiCard label="Visits · 30 days" value={data.kpis.visits30d} />
        <KpiCard label="Page views · 30 days" value={data.kpis.views30d} />
        <KpiCard label="Registrations · 30 days" value={data.kpis.registrations30d} sub="Sent from the website" />
      </div>
      <DailyChart daily={data.daily} now={data.asOf} />
      <div style={{ display: "flex", gap: "var(--rsd-gap)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <Funnel funnel={data.funnel} />
        <Sources sources={data.sources} />
      </div>
      <div style={{ display: "flex", gap: "var(--rsd-gap)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <TopPages pages={data.topPages} />
        <Registrations regs={data.registrations} now={data.asOf} />
      </div>
      <RecentVisits visits={data.visits} now={data.asOf} />
    </div>
  );
}
