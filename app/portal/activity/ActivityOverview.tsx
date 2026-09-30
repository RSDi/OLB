"use client";
// The Activity page's front view: usage at a glance, every member with a
// login (last sign-in, last seen, sessions) plus approved members not signed
// up yet, the most-visited pages, and the "Preview as" log. Rows open that
// member's sessions (?u=<user id>).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClearSearchButton, KpiCard } from "../../components/ui";
import { PreviewButton } from "./PreviewButton";
import type { ActivityOverview as Overview, RosterMember } from "../../../lib/activity/queries";
import { previewBlocker } from "../../../lib/activity/preview-rules";
import {
  ROLE_LABELS,
  fmtDateTime,
  fmtDay,
  fmtDuration,
  lastDays,
  pathLabel,
  relTime,
} from "../../../lib/activity/paths";

type Filter = "all" | "active" | "never";

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

function Roster({ members, viewerUserId, now }: { members: RosterMember[]; viewerUserId: string; now: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const month = now - 30 * 86400_000;
    return members
      .filter((m) => !needle || m.name.toLowerCase().includes(needle) || (m.email ?? "").toLowerCase().includes(needle))
      .filter((m) =>
        filter === "active"
          ? !!m.lastSeenAt && Date.parse(m.lastSeenAt) >= month
          : filter === "never"
          ? !m.lastLoginAt && !m.lastSeenAt
          : true
      )
      .sort((a, b) => {
        // Most recently seen first; never-seen last, by name.
        const at = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
        const bt = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
        return bt - at || a.name.localeCompare(b.name);
      });
  }, [members, q, filter, now]);

  const counts = {
    all: members.length,
    active: members.filter((m) => m.lastSeenAt && now - Date.parse(m.lastSeenAt) < 30 * 86400_000).length,
    never: members.filter((m) => !m.lastLoginAt && !m.lastSeenAt).length,
  };
  const canPreview = (m: RosterMember) =>
    previewBlocker(
      { user_id: m.userId, email: m.email, role: m.role, status: m.status, access_revoked_at: m.revoked ? "revoked" : null },
      viewerUserId
    ) === null;
  // The guided tour points at the first "Preview as" button.
  const firstPreviewable = rows.find(canPreview);

  return (
    <div className="rsd-card" data-tour="activity-members">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Members</h2>
          <div style={muted}>Everyone with a portal login, and approved members who haven&apos;t signed up yet. Tap a row to see their sessions.</div>
        </div>
        <div style={{ position: "relative" }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            aria-label="Search members"
            data-tour="activity-search"
            style={{
              padding: "8px 40px 8px 12px",
              borderRadius: 10,
              border: "1px solid var(--gw-border)",
              background: "var(--gw-bg)",
              fontSize: 13,
              minWidth: 220,
            }}
          />
          {q && <ClearSearchButton onClear={() => setQ("")} />}
        </div>
      </div>
      <div role="tablist" aria-label="Show" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(
          [
            ["all", "All"],
            ["active", "Seen in 30 days"],
            ["never", "Never signed in"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className="gw-press"
            style={{
              padding: "6px 12px",
              borderRadius: 100,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid",
              borderColor: filter === key ? "var(--gw-fg)" : "var(--gw-border)",
              background: filter === key ? "var(--gw-fg)" : "transparent",
              color: filter === key ? "var(--gw-bg-elev)" : "var(--gw-fg-muted)",
            }}
          >
            {label} · {counts[key]}
          </button>
        ))}
      </div>
      <table className="rsd-tbl">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Last sign-in</th>
            <th>Last seen</th>
            <th className="num">Sessions · 30d</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", color: "var(--gw-fg-muted)" }}>
                Nobody matches.
              </td>
            </tr>
          )}
          {rows.map((m) => {
            return (
              <tr
                key={m.memberId}
                onClick={m.userId ? () => router.push(`/portal/activity?u=${m.userId}`) : undefined}
                style={{ cursor: m.userId ? "pointer" : "default" }}
              >
                <td>
                  <div style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                    {m.userId ? (
                      <Link
                        href={`/portal/activity?u=${m.userId}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
                      >
                        {m.name}
                      </Link>
                    ) : (
                      <span style={{ fontWeight: 700 }}>{m.name}</span>
                    )}
                    <span style={{ ...muted, fontWeight: 500 }}>
                      {m.email}
                      {!m.userId && (
                        <>
                          {" "}
                          <Chip>{m.email?.trim() ? "Not signed up" : "Directory only"}</Chip>
                        </>
                      )}
                      {m.revoked && (
                        <>
                          {" "}
                          <Chip tone="bad">No login</Chip>
                        </>
                      )}
                      {m.status !== "approved" && (
                        <>
                          {" "}
                          <Chip>{m.status === "pending" ? "Awaiting approval" : "Denied"}</Chip>
                        </>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <Chip tone={m.role === "super_admin" ? "warn" : m.role === "admin" ? "ok" : "mute"}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </Chip>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <When iso={m.lastLoginAt} now={now} empty={<Chip>Not yet</Chip>} />
                </td>
                <td style={{ maxWidth: 280 }}>
                  {m.lastSeenAt ? (
                    <div style={{ display: "flex", flexDirection: "column", padding: "8px 0" }}>
                      <When iso={m.lastSeenAt} now={now} empty={null} />
                      {m.lastSeenPath && (
                        <span
                          title={m.lastSeenPath}
                          style={{ ...muted, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {pathLabel(m.lastSeenPath)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={muted}>—</span>
                  )}
                </td>
                <td className="num">{m.sessions30d}</td>
                <td
                  style={{ textAlign: "right" }}
                  onClick={(e) => e.stopPropagation()}
                  data-tour={m === firstPreviewable ? "activity-preview" : undefined}
                >
                  {canPreview(m) && <PreviewButton memberId={m.memberId} name={m.name} email={m.userId ? null : m.email} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

export function ActivityOverview({ data, viewerUserId }: { data: Overview; viewerUserId: string }) {
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
          Who&apos;s using the portal and how — sign-ins, sessions and the pages people open. Use{" "}
          <strong>Preview as</strong> to see the portal exactly as a member does.
        </div>
      </div>
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
      <div className="rsd-kpi-grid" data-tour="activity-kpis">
        <KpiCard label="Sign-ins · 7 days" value={data.kpis.logins7d} />
        <KpiCard label="Active · 24 hours" value={data.kpis.active24h} sub="People who opened the portal" />
        <KpiCard label="Active · 7 days" value={data.kpis.active7d} sub={`of ${data.members.filter((m) => m.userId).length} with a login`} />
        <KpiCard label="Previews · 30 days" value={data.kpis.previews30d} />
      </div>
      <DailyChart daily={data.daily} now={data.asOf} />
      <Roster members={data.members} viewerUserId={viewerUserId} now={data.asOf} />
      <div style={{ display: "flex", gap: "var(--rsd-gap)", flexWrap: "wrap", alignItems: "flex-start" }}>
        <TopPages pages={data.topPages} />
        <Previews previews={data.previews} now={data.asOf} />
      </div>
    </>
  );
}
