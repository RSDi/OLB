"use client";
// Activity, inside Settings → Members (super-admins on the staged-rollout
// list): the usage numbers, the Activity tab (people each day, most-visited
// pages, the "Preview as" log), and the activity on each Approved row (last
// seen, and a panel of their sessions that open page by page on
// /portal/activity?u=<user id>).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { KpiCard } from "../../components/ui";
import { fetchMemberSessions } from "./load-actions";
import type { ActivityOverview as Overview, RosterMember, SessionSummary } from "../../../lib/activity/queries";
import { previewBlocker } from "../../../lib/activity/preview-rules";
import {
  fmtDateTime,
  fmtDay,
  fmtDuration,
  lastDays,
  pathLabel,
  relTime,
} from "../../../lib/activity/paths";

const muted = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 } as const;

function Chip({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "warn" | "ok" | "bad" }) {
  const tones = {
    mute: { background: "var(--gw-bg)", color: "var(--gw-fg-muted)", border: "var(--gw-border)" },
    warn: { background: "#FEF3C7", color: "#7A4B00", border: "#F5D48A" },
    ok: { background: "var(--gw-success-bg)", color: "var(--gw-success)", border: "transparent" },
    bad: { background: "var(--gw-error-bg)", color: "var(--gw-error)", border: "transparent" },
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

// Relative to when the page's data was read, so the server render and the
// browser agree.
function When({ iso, now, empty }: { iso: string | null; now: number; empty: React.ReactNode }) {
  if (!iso) return <>{empty}</>;
  return <span title={fmtDateTime(iso)}>{relTime(iso, now)}</span>;
}

// People each day, last 30 days. One series, so no legend: the title names it.
function DailyChart({ daily, now }: { daily: Overview["daily"]; now: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const byDay = new Map(daily.map((d) => [d.day, d]));
    return lastDays(30, now).map((day) => ({ day, people: byDay.get(day)?.people ?? 0, views: byDay.get(day)?.views ?? 0 }));
  }, [daily, now]);
  const max = Math.max(1, ...days.map((d) => d.people));
  const peak = days.reduce((a, b) => (b.people > a.people ? b : a), days[0]);
  const shown = hover !== null ? days[hover] : null;

  return (
    <div className="rsd-card" data-tour="activity-daily">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>People each day</h2>
          <div style={muted}>Members who opened the portal, last 30 days (previews not counted)</div>
        </div>
        <div style={{ ...muted, fontVariantNumeric: "tabular-nums" }} aria-live="polite">
          {shown
            ? `${fmtDay(shown.day)} · ${shown.people} ${shown.people === 1 ? "person" : "people"} · ${shown.views} page views`
            : peak.people > 0
            ? `Busiest: ${fmtDay(peak.day)} · ${peak.people} ${peak.people === 1 ? "person" : "people"}`
            : "No visits yet"}
        </div>
      </div>
      <div
        role="list"
        aria-label="People each day, last 30 days"
        style={{ display: "flex", alignItems: "stretch", gap: 2, height: 120, borderBottom: "1px solid var(--gw-border)" }}
        onMouseLeave={() => setHover(null)}
      >
        {days.map((d, i) => (
          <div
            key={d.day}
            role="listitem"
            tabIndex={0}
            aria-label={`${fmtDay(d.day)}: ${d.people} ${d.people === 1 ? "person" : "people"}, ${d.views} page views`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{ flex: 1, display: "flex", alignItems: "flex-end", cursor: "default", outline: "none" }}
          >
            <div
              style={{
                width: "100%",
                height: d.people ? `${Math.max(3, (d.people / max) * 100)}%` : 0,
                background: hover === i ? "#7A5B00" : "#A67C00",
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

function TopPages({ pages }: { pages: Overview["topPages"] }) {
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Most visited pages</h2>
        <div style={muted}>Last 30 days</div>
      </div>
      {pages.length === 0 ? (
        <div style={muted}>No visits recorded yet.</div>
      ) : (
        <table className="rsd-tbl">
          <thead>
            <tr>
              <th>Page</th>
              <th className="num">Views</th>
              <th className="num">People</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.page}>
                <td title={p.page}>{pathLabel(p.page)}</td>
                <td className="num">{p.views}</td>
                <td className="num">{p.people}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const END_LABELS: Record<string, string> = {
  exit: "Exited",
  logout: "Signed out",
  expired: "Timed out",
  invalid: "Ended (no longer super-admin)",
};

function Previews({ previews, now }: { previews: Overview["previews"]; now: number }) {
  return (
    <div className="rsd-card" style={{ flex: "1 1 340px" }} data-tour="activity-previews">
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Previews</h2>
        <div style={muted}>Every “Preview as” — who, whom, and for how long</div>
      </div>
      {previews.length === 0 ? (
        <div style={muted}>No previews yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {previews.map((p) => {
            const href = p.sessionId
              ? `/portal/activity?u=${p.targetUserId}&sid=${p.sessionId}`
              : `/portal/activity?u=${p.targetUserId}`;
            return (
              <Link
                key={p.id}
                href={href}
                className="rsd-dash-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--gw-border)",
                  textDecoration: "none",
                  color: "var(--gw-fg)",
                }}
              >
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    {p.impersonatorName} <span style={{ color: "var(--gw-fg-muted)", fontWeight: 500 }}>as</span>{" "}
                    {p.targetName}
                  </span>
                  <span style={{ ...muted, fontWeight: 500 }}>{fmtDateTime(p.startedAt)}</span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {p.endedAt ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmtDuration(Date.parse(p.endedAt) - Date.parse(p.startedAt))}
                      </span>
                      <span style={{ ...muted, fontWeight: 500 }}>{END_LABELS[p.endReason ?? ""] ?? "Ended"}</span>
                    </>
                  ) : Date.parse(p.expiresAt) <= now ? (
                    // Past its 2 hours but never exited: the browser hasn't
                    // been back since. It ends the next time it is.
                    <span style={{ ...muted, fontWeight: 500 }}>Timed out</span>
                  ) : (
                    <Chip tone="warn">In progress</Chip>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Settings → Members → Activity: the club-wide numbers that don't belong to
// one person. Each member's own activity is on their Approved row.
export function ActivityTab({ data }: { data: Overview }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rsd-gap)" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
        How the portal is being used. Each member&apos;s last visit, sessions and <strong>Preview as</strong> are on
        their row on the <strong>Approved</strong> tab.
      </div>
      <DailyChart daily={data.daily} now={data.asOf} />
      <div style={{ display: "flex", gap: "var(--rsd-gap)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <TopPages pages={data.topPages} />
        <Previews previews={data.previews} now={data.asOf} />
      </div>
    </div>
  );
}

// The four usage numbers, above the Approved and Activity tabs.
export function UsageStrip({ data }: { data: Overview }) {
  return (
    <>
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
            marginBottom: 14,
          }}
        >
          {data.error}
        </div>
      )}
      <div className="rsd-kpi-grid" data-tour="activity-kpis" style={{ marginBottom: 14 }}>
        <KpiCard label="Sign-ins · 7 days" value={data.kpis.logins7d} />
        <KpiCard label="Active · 24 hours" value={data.kpis.active24h} sub="People who opened the portal" />
        <KpiCard label="Active · 7 days" value={data.kpis.active7d} sub={`of ${data.members.filter((m) => m.userId).length} with a login`} />
        <KpiCard label="Previews · 30 days" value={data.kpis.previews30d} />
      </div>
    </>
  );
}

// Whether a member's row offers "Preview as" (the server action checks too).
export function canPreview(m: RosterMember, viewerUserId: string): boolean {
  return (
    previewBlocker(
      { user_id: m.userId, email: m.email, role: m.role, status: m.status, access_revoked_at: m.revoked ? "revoked" : null },
      viewerUserId
    ) === null
  );
}

// The line under a member's name on the Approved tab.
export function LastSeenLine({ m, now }: { m: RosterMember; now: number }) {
  if (!m.lastSeenAt)
    return (
      <span style={{ color: m.userId ? "var(--gw-fg-muted)" : "#7A4B00" }}>
        {m.lastLoginAt ? <>Signed in <When iso={m.lastLoginAt} now={now} empty={null} /></> : "Never signed in"}
      </span>
    );
  return (
    <span>
      Last seen <When iso={m.lastSeenAt} now={now} empty={null} />
      {m.lastSeenPath && <> on {pathLabel(m.lastSeenPath)}</>}
      {" · "}
      {m.sessions30d} {m.sessions30d === 1 ? "session" : "sessions"} in 30 days
    </span>
  );
}

// A member's own activity, opened from their Approved row: sessions each day
// for the last 30 days, then their latest sessions. Each opens page by page
// on the session pages.
export function MemberActivityPanel({ userId }: { userId: string }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; error: string } | { status: "ok"; sessions: SessionSummary[]; asOf: number }
  >({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetchMemberSessions(userId).then((r) => {
      if (!live) return;
      setState("error" in r ? { status: "error", error: r.error } : { status: "ok", sessions: r.sessions, asOf: r.asOf });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const wrap = (children: React.ReactNode) => (
    <div
      data-tour="members-activity"
      style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--gw-border)", display: "flex", flexDirection: "column", gap: 10 }}
    >
      {children}
    </div>
  );
  if (state.status === "loading") return wrap(<div style={muted}>Loading…</div>);
  if (state.status === "error") return wrap(<div style={{ ...muted, color: "var(--gw-error)" }}>{state.error}</div>);

  const { sessions, asOf } = state;
  const own = sessions.filter((s) => !s.isPreview);
  const perDay = new Map<string, number>();
  for (const s of own) {
    const day = lastDays(1, Date.parse(s.startedAt))[0];
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const days = lastDays(30, asOf).map((day) => ({ day, n: perDay.get(day) ?? 0 }));
  const max = Math.max(1, ...days.map((d) => d.n));
  const recent = sessions.slice(0, 5);

  return wrap(
    <>
      <div>
        <div style={{ ...muted, marginBottom: 4 }}>Sessions each day, last 30 days</div>
        <div
          role="img"
          aria-label={`${own.filter((s) => asOf - Date.parse(s.startedAt) < 30 * 86400_000).length} sessions in the last 30 days`}
          style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40, borderBottom: "1px solid var(--gw-border)" }}
        >
          {days.map((d) => (
            <div
              key={d.day}
              title={`${fmtDay(d.day)}: ${d.n} ${d.n === 1 ? "session" : "sessions"}`}
              style={{
                flex: 1,
                height: d.n ? `${Math.max(8, (d.n / max) * 100)}%` : 0,
                background: "#A67C00",
                borderRadius: "3px 3px 0 0",
              }}
            />
          ))}
        </div>
      </div>
      {recent.length === 0 ? (
        <div style={muted}>No sessions yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {recent.map((s) => (
            <Link
              key={s.sid}
              href={`/portal/activity?u=${userId}&sid=${s.sid}`}
              className="rsd-dash-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "6px 4px",
                fontSize: 13,
                color: "var(--gw-fg)",
                textDecoration: "none",
                borderBottom: "1px solid var(--gw-border)",
              }}
            >
              <span style={{ fontWeight: 700, display: "inline-flex", gap: 6, alignItems: "center" }}>
                <span title={fmtDateTime(s.startedAt)}>{relTime(s.startedAt, asOf)}</span>
                {s.isPreview && <Chip tone="warn">Preview</Chip>}
              </span>
              <span style={{ ...muted, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                {s.pageViews} {s.pageViews === 1 ? "page" : "pages"} ·{" "}
                {fmtDuration(Date.parse(s.lastEventAt) - Date.parse(s.startedAt))}
              </span>
            </Link>
          ))}
        </div>
      )}
      <Link href={`/portal/activity?u=${userId}`} style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
        All sessions →
      </Link>
    </>
  );
}
