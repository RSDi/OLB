// A member's sign-in sessions (?u=<user id>) and one session's timeline
// (&sid=<session id>) on the Activity page. Server components: plain links,
// times printed in the club's time zone.

import Link from "next/link";
import type { SessionSummary, TrailEvent } from "../../../lib/activity/queries";
import { SESSION_EVENT_LIMIT } from "../../../lib/activity/queries";
import { describePath, fmtClock, fmtDateTime, fmtDuration, parseUserAgent, relTime } from "../../../lib/activity/paths";

const ACTIVE_MS = 30 * 60 * 1000; // a session with activity this recent is "Active now"
const IDLE_MS = 30 * 60 * 1000; // gaps this long get an "idle" divider

const muted = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 } as const;

function Chip({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "warn" | "ok" }) {
  const t = {
    mute: { background: "var(--gw-bg)", color: "var(--gw-fg-muted)" },
    warn: { background: "#FEF3C7", color: "#7A4B00" },
    ok: { background: "var(--gw-success-bg)", color: "var(--gw-success)" },
  }[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        borderRadius: 100,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...t,
      }}
    >
      {children}
    </span>
  );
}

function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, flexWrap: "wrap" }}>
      {items.map((c, i) => (
        <span key={i} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          {i > 0 && <span style={{ color: "var(--gw-fg-faint)" }}>→</span>}
          {c.href ? (
            <Link href={c.href} style={{ color: "var(--gw-fg-muted)", textDecoration: "none" }}>
              {c.label}
            </Link>
          ) : (
            <span style={{ color: "var(--gw-fg)", fontWeight: 700 }}>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" style={{ background: "var(--gw-error-bg)", color: "var(--gw-error)", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 600 }}>
      {message}
    </div>
  );
}

export function SessionsList({
  userId,
  name,
  sessions,
  now,
  error,
}: {
  userId: string;
  name: string;
  sessions: SessionSummary[];
  now: number;
  error: string | null;
}) {
  return (
    <>
      <Crumbs items={[{ label: "Members · Activity", href: "/portal/settings?tab=members&show=activity" }, { label: name }]} />
      {error && <ErrorNote message={error} />}
      <div className="rsd-card">
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Sessions</h2>
          <div style={muted}>Each time {name} signed in, newest first (latest 50). Tap one to see every page they opened.</div>
        </div>
        {sessions.length === 0 ? (
          <div style={muted}>No sessions recorded yet. Activity is recorded from the day this page went live.</div>
        ) : (
          <table className="rsd-tbl">
            <thead>
              <tr>
                <th>Started</th>
                <th>Length</th>
                <th className="num">Pages</th>
                <th>Device</th>
                <th aria-label="Notes" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const href = `/portal/activity?u=${userId}&sid=${s.sid}`;
                return (
                  <tr key={s.sid}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link href={href} style={{ color: "var(--gw-fg)", fontWeight: 700, textDecoration: "none" }}>
                        {fmtDateTime(s.startedAt)}
                      </Link>{" "}
                      <span style={{ ...muted, fontWeight: 500 }}>· {relTime(s.startedAt, now)}</span>
                    </td>
                    <td>{fmtDuration(Date.parse(s.lastEventAt) - Date.parse(s.startedAt))}</td>
                    <td className="num">{s.pageViews}</td>
                    <td>{parseUserAgent(s.device)}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        {s.isPreview && <Chip tone="warn">Preview · by {s.previewedBy}</Chip>}
                        {now - Date.parse(s.lastEventAt) < ACTIVE_MS && <Chip tone="ok">Active now</Chip>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const DOT: Record<TrailEvent["type"], string> = {
  login: "var(--gw-success)",
  logout: "var(--gw-fg-faint)",
  preview_start: "#F59E0B",
  preview_stop: "var(--gw-error)",
  page_view: "var(--gw-fg-muted)",
};

function eventLabel(e: TrailEvent): React.ReactNode {
  const by = typeof e.meta.impersonator_name === "string" && e.meta.impersonator_name ? e.meta.impersonator_name : "a super-admin";
  switch (e.type) {
    case "login":
      return <Chip tone="ok">Signed in</Chip>;
    case "logout":
      return <Chip>Signed out</Chip>;
    case "preview_start":
      return <Chip tone="warn">Preview started by {by}</Chip>;
    case "preview_stop": {
      const why = e.meta.reason === "expired" ? " (timed out)" : e.meta.reason === "logout" ? " (signed out)" : "";
      return <Chip tone="warn">Preview ended{why}</Chip>;
    }
    default: {
      const p = describePath(e.path);
      return (
        <span title={e.path} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <strong>{p.section}</strong>
          {p.page && <> · {p.page}</>}
          {p.detail && <span style={{ ...muted, fontWeight: 500 }}> · {p.detail}</span>}
        </span>
      );
    }
  }
}

export function SessionTimeline({
  userId,
  name,
  session,
  events,
  total,
  now,
  error,
}: {
  userId: string;
  name: string;
  session: SessionSummary | null;
  events: TrailEvent[];
  total: number;
  now: number;
  error: string | null;
}) {
  const first = events[0];
  const last = events[events.length - 1];
  const isPreview = session?.isPreview ?? events.some((e) => e.impersonatorUserId);

  return (
    <>
      <Crumbs
        items={[
          { label: "Members · Activity", href: "/portal/settings?tab=members&show=activity" },
          { label: name, href: `/portal/activity?u=${userId}` },
          { label: "Session" },
        ]}
      />
      {error && <ErrorNote message={error} />}
      <div className="rsd-card" style={{ gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{name}</h2>
          {isPreview && <Chip tone="warn">Preview session · by {session?.previewedBy ?? "a super-admin"}</Chip>}
          {last && now - Date.parse(last.at) < ACTIVE_MS && <Chip tone="ok">Active now</Chip>}
        </div>
        {first && last && (
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              ["Started", fmtDateTime(first.at)],
              ["Length", fmtDuration(Date.parse(last.at) - Date.parse(first.at))],
              ["Pages", String(events.filter((e) => e.type === "page_view").length)],
              ["Device", parseUserAgent(session?.device)],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span className="rsd-eyebrow">{label}</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="rsd-card" style={{ gap: 0 }}>
        {events.length === 0 ? (
          <div style={muted}>Nothing recorded for this session.</div>
        ) : (
          events.map((e, i) => {
            const next = events[i + 1];
            const gap = next ? Date.parse(next.at) - Date.parse(e.at) : null;
            return (
              <div key={e.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 36, fontSize: 14 }}>
                  <span style={{ width: 92, flexShrink: 0, ...muted, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {fmtClock(e.at)}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: DOT[e.type] }}
                  />
                  <span style={{ flex: 1, minWidth: 0, display: "flex" }}>{eventLabel(e)}</span>
                  <span style={{ flexShrink: 0, ...muted, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                    {gap === null ? "last activity" : gap < IDLE_MS ? fmtDuration(gap) : ""}
                  </span>
                </div>
                {gap !== null && gap >= IDLE_MS && (
                  <div style={{ textAlign: "center", ...muted, fontWeight: 500, padding: "6px 0", borderTop: "1px dashed var(--gw-border)", borderBottom: "1px dashed var(--gw-border)", margin: "4px 0" }}>
                    idle {fmtDuration(gap)}
                  </div>
                )}
              </div>
            );
          })
        )}
        {total > events.length && (
          <div style={{ ...muted, paddingTop: 12 }}>
            Showing the first {SESSION_EVENT_LIMIT} of {total} events.
          </div>
        )}
      </div>
    </>
  );
}
