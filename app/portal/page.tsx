import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../components/icons";
import { KpiCard } from "../components/ui";
import { createClient } from "../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../lib/auth/permissions";
import { expandEventOccurrences } from "../../lib/events/occurrences";
import { memberDisplayName, memberFirstName } from "../../lib/members/display";

interface RecentTicket {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  created_at: string;
  submitted_by: string | null;
  area: { name: string } | null;
  priority: { label: string; chip_class: string; severity: number } | null;
}

interface UpcomingEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
}

export default async function PortalDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("id, role, status, full_name, nickname")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as (MemberLike & { id: string; full_name: string | null; nickname: string | null }) | null) ?? null;
  const staff = isStaff(me);

  // KPIs are for people "actively helping" — staff, area owners/helpers, or
  // volunteer-team members. Plain members get the lean request-focused view.
  let involved = staff;
  if (!involved && me?.id) {
    const [{ count: areaCount }, { count: teamCount }] = await Promise.all([
      supabase.from("area_members").select("member_id", { count: "exact", head: true }).eq("member_id", me.id),
      supabase.from("member_volunteer_teams").select("member_id", { count: "exact", head: true }).eq("member_id", me.id),
    ]);
    involved = (areaCount ?? 0) > 0 || (teamCount ?? 0) > 0;
  }

  // Counts are RLS-bound — staff sees totals, members see their own.
  const { data: countRows } = await supabase
    .from("maintenance_requests")
    .select("status, priority:priorities(severity)")
    .is("deleted_at", null);
  const counts = countByStatus(
    (countRows as unknown as { status: RecentTicket["status"]; priority: { severity: number } | null }[]) ?? []
  );

  // Building-committee KPI: requests waiting on a review vote. Staff-only;
  // mirrors the Review queue's "Needs review" count.
  let reviewCount = 0;
  if (staff) {
    const { count } = await supabase
      .from("maintenance_requests")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .not("details", "is", null)
      .eq("review_status", "pending_review");
    reviewCount = count ?? 0;
  }

  const { data: recentRaw } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, created_at, submitted_by,
       area:areas(name),
       priority:priorities(label, chip_class, severity)`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5);
  const recent = (recentRaw as unknown as RecentTicket[]) ?? [];

  const submitterIds = Array.from(
    new Set(recent.map((t) => t.submitted_by).filter((v): v is string => Boolean(v)))
  );
  const submitterMap: Record<string, { full_name: string | null; nickname: string | null; email: string }> = {};
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", submitterIds);
    for (const s of submitters ?? []) {
      submitterMap[s.user_id] = { full_name: s.full_name, nickname: s.nickname, email: s.email };
    }
  }

  const recentLabel = staff ? "Recent Requests" : "My Recent Requests";
  const firstName = me ? memberFirstName(me) : null;

  // Due PM tasks (staff-only). Pending/in-progress instances whose
  // scheduled date has already arrived or lands within the next 7 days.
  interface DuePmTask {
    id: string;
    title: string;
    status: "pending" | "in_progress" | "done" | "skipped";
    scheduled_for: string;
    area: { name: string } | null;
    priority: { label: string; chip_class: string } | null;
  }
  let duePmTasks: DuePmTask[] = [];
  if (staff) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);
    horizon.setHours(23, 59, 59, 999);
    const { data: pmRaw } = await supabase
      .from("pm_instances")
      .select(
        `id, title, status, scheduled_for,
         area:areas(name),
         priority:priorities(label, chip_class)`
      )
      .is("deleted_at", null)
      .in("status", ["pending", "in_progress"])
      .lte("scheduled_for", horizon.toISOString().slice(0, 10))
      .order("scheduled_for", { ascending: true })
      .limit(5);
    duePmTasks = (pmRaw as unknown as DuePmTask[]) ?? [];
  }

  // Upcoming events for the dashboard card + KPI count. RLS lets every
  // approved member read events, so no role gating needed here. Recurring
  // events (0062) are expanded into occurrences so the next few instances show.
  const now = new Date();
  const nowMs = now.getTime();
  const { data: eventsRaw } = await supabase
    .from("events")
    .select("id, title, start_at, end_at, recurring, recur_freq, recur_weekdays, recur_monthly_week, recur_monthly_weekday, recur_until, recur_except")
    .is("deleted_at", null);
  const baseEvents =
    (eventsRaw as (UpcomingEvent & {
      recurring: boolean | null;
      recur_freq: string | null;
      recur_weekdays: number[] | null;
      recur_monthly_week: number | null;
      recur_monthly_weekday: number | null;
      recur_until: string | null;
      recur_except: string[] | null;
    })[]) ?? [];
  const upcomingEvents: UpcomingEvent[] = expandEventOccurrences(baseEvents, {
    from: now,
    to: new Date(nowMs + 90 * 86400000),
  })
    .filter((o) => new Date(o.startAt).getTime() >= nowMs)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 5)
    .map((o) => ({ id: o.event.id, title: o.event.title, start_at: o.startAt, end_at: o.endAt }));

  // Low-stock alert: surface supplies where on_hand <= reorder_threshold.
  // Only staff sees it (members never see supplies).
  interface LowStockRow {
    id: string;
    name: string;
    unit: string;
    on_hand: number;
    reorder_threshold: number;
  }
  let lowStock: LowStockRow[] = [];
  if (staff) {
    const { data: lowRaw } = await supabase
      .from("supplies")
      .select("id, name, unit, on_hand, reorder_threshold")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    lowStock = ((lowRaw as LowStockRow[]) ?? [])
      .map((s) => ({
        ...s,
        on_hand: Number(s.on_hand),
        reorder_threshold: Number(s.reorder_threshold),
      }))
      .filter((s) => s.on_hand <= s.reorder_threshold);
  }

  return (
    <>
      {/* KPIs — only for people actively helping (staff / area leads / volunteers) */}
      {involved && (
        <div
          className="rsd-kpi-grid"
          style={staff ? { gridTemplateColumns: "repeat(5, 1fr)" } : undefined}
        >
          <KpiCard
            label={staff ? "Open Requests" : "My Open"}
            value={counts.open}
            sub={counts.high_priority > 0 ? `${counts.high_priority} high priority` : undefined}
            accent={counts.open > 0}
          />
          <KpiCard
            label="In Progress"
            value={counts.in_progress}
            sub={counts.in_progress > 0 ? "Being worked on" : undefined}
          />
          <KpiCard label="Done" value={counts.done} sub="All time" />
          {staff && (
            <KpiCard
              label="Needs Review"
              value={reviewCount}
              sub={reviewCount > 0 ? "Review queue →" : "All caught up"}
              accent={reviewCount > 0}
              href="/portal/review"
            />
          )}
          <KpiCard
            label="Upcoming Events"
            value={upcomingEvents.length}
            sub={upcomingEvents.length > 0 ? `next: ${formatShortDate(upcomingEvents[0].start_at)}` : "none scheduled"}
          />
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link
          href="/portal/requests"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 100,
            background: "var(--rsd-accent)",
            color: "var(--rsd-accent-on)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.Plus width={14} height={14} />
          Make a request
        </Link>
        <Link
          href="/portal/tasks"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg)",
            textDecoration: "none",
          }}
        >
          <Icons.Wrench width={14} height={14} />
          View all requests
        </Link>
        <Link
          href="/portal/requests/building-use"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg)",
            textDecoration: "none",
          }}
        >
          <Icons.Calendar width={14} height={14} />
          Reserve a room or space
        </Link>
      </div>

      {firstName && (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Welcome back, {firstName}.
        </div>
      )}

      {lowStock.length > 0 && (
        <div
          className="rsd-card"
          style={{
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icons.AlertTriangle
                width={16}
                height={16}
                style={{ color: "var(--gw-error)" }}
              />
              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-error)" }}>
                {lowStock.length} suppl{lowStock.length === 1 ? "y" : "ies"} need restocking
              </span>
            </div>
            <Link
              href="/portal/settings"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--gw-error)",
                textDecoration: "none",
              }}
            >
              Manage supplies →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {lowStock.slice(0, 5).map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  fontSize: 13,
                  color: "var(--gw-fg)",
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  {formatQty(s.on_hand)} on hand · reorder at {formatQty(s.reorder_threshold)}
                </span>
              </div>
            ))}
            {lowStock.length > 5 && (
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                +{lowStock.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          gap: "var(--rsd-gap)",
        }}
      >
        {/* Recent maintenance */}
        <div className="rsd-card" style={{ gap: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
                Facilities
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{recentLabel}</h3>
            </div>
            <Link
              href="/portal/tasks"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500 }}>
              {staff ? "No requests yet." : "You haven't submitted any requests yet."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recent.map((r, i) => {
                const submitter = r.submitted_by ? submitterMap[r.submitted_by] ?? null : null;
                return (
                  <Link
                    key={r.id}
                    href={`/portal/tasks/${r.id}`}
                    className="rsd-dash-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "12px 10px",
                      margin: "0 -10px",
                      borderBottom: i < recent.length - 1 ? "1px solid var(--gw-border)" : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        background: "var(--gw-bg)",
                        border: "1px solid var(--gw-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--gw-fg-muted)",
                        flexShrink: 0,
                      }}
                    >
                      <Icons.Wrench width={14} height={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: "var(--gw-fg)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {truncate(r.description, 56)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--gw-fg-muted)",
                          fontWeight: 500,
                          marginTop: 3,
                        }}
                      >
                        {r.area?.name ?? "Unknown area"} · {formatDate(r.created_at)}
                        {staff && submitter ? ` · ${memberDisplayName(submitter)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      {r.priority && (
                        <span className={`rsd-chip ${r.priority.chip_class}`}>{r.priority.label}</span>
                      )}
                      {statusChip(r.status)}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming events */}
        <div className="rsd-card" style={{ gap: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
                Schedule
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Upcoming Events</h3>
            </div>
            <Link
              href="/portal/events"
              style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
            >
              View all →
            </Link>
          </div>
          {upcomingEvents.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500 }}>
              No upcoming events scheduled.{" "}
              {staff && (
                <Link
                  href="/portal/events/new"
                  style={{ color: "var(--rsd-accent)", fontWeight: 700, textDecoration: "none" }}
                >
                  Add one →
                </Link>
              )}
            </div>
          ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {upcomingEvents.map((e, i) => (
              <Link
                key={`${e.id}-${e.start_at}`}
                href={`/portal/events`}
                className="rsd-dash-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 10px",
                  margin: "0 -10px",
                  borderBottom: i < upcomingEvents.length - 1 ? "1px solid var(--gw-border)" : "none",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: "var(--rsd-accent-bg)",
                    border: "1px solid rgba(108,140,89,.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--rsd-accent)",
                    flexShrink: 0,
                  }}
                >
                  <Icons.Calendar width={14} height={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 3 }}>
                    {formatEventTime(e.start_at, e.end_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          )}
        </div>

        {staff && (
          <div className="rsd-card" style={{ gap: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
                  Preventative
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Due PM Tasks</h3>
              </div>
              <Link
                href="/portal/pm"
                style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}
              >
                View all →
              </Link>
            </div>
            {duePmTasks.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500 }}>
                Nothing due in the next 7 days.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {duePmTasks.map((t, i) => {
                  const overdue = new Date(t.scheduled_for) < startOfToday();
                  return (
                    <Link
                      key={t.id}
                      href={`/portal/pm/${t.id}`}
                      className="rsd-dash-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 10px",
                        margin: "0 -10px",
                        borderBottom: i < duePmTasks.length - 1 ? "1px solid var(--gw-border)" : "none",
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          background: overdue ? "var(--gw-error-bg)" : "var(--gw-bg)",
                          border: `1px solid ${overdue ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: overdue ? "var(--gw-error)" : "var(--gw-fg-muted)",
                          flexShrink: 0,
                        }}
                      >
                        <Icons.Clock width={14} height={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: "var(--gw-fg)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t.title}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 3 }}>
                          {t.area?.name ?? "No area"} ·{" "}
                          <span style={{ color: overdue ? "var(--gw-error)" : "inherit", fontWeight: overdue ? 700 : 500 }}>
                            {scheduleLabel(t.scheduled_for)}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        {t.priority && (
                          <span className={`rsd-chip ${t.priority.chip_class}`}>{t.priority.label}</span>
                        )}
                        {pmStatusChip(t.status)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function statusChip(s: RecentTicket["status"]) {
  if (s === "open") return <span className="rsd-chip rsd-chip-warn">Open</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "cancelled") return <span className="rsd-chip rsd-chip-mute">Cancelled</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function formatQty(n: number): string {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function scheduleLabel(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = startOfToday();
  const diff = Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 7) return `In ${diff} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pmStatusChip(s: "pending" | "in_progress" | "done" | "skipped") {
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "skipped") return <span className="rsd-chip rsd-chip-mute">Skipped</span>;
  if (s === "done") return <span className="rsd-chip rsd-chip-success">Done</span>;
  return <span className="rsd-chip rsd-chip-warn">Pending</span>;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatEventTime(startIso: string, endIso: string | null): string {
  // Church timezone (America/Chicago), not the server's UTC — see events list.
  const long = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" } as const;
  const startStr = new Date(startIso).toLocaleString(undefined, long);
  if (!endIso) return startStr;
  const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const sameDay = dayKey(startIso) === dayKey(endIso);
  const endStr = sameDay
    ? new Date(endIso).toLocaleString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })
    : new Date(endIso).toLocaleString(undefined, long);
  return `${startStr} – ${endStr}`;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function countByStatus(
  rows: { status: RecentTicket["status"]; priority: { severity: number } | null }[]
) {
  const out = { open: 0, in_progress: 0, done: 0, cancelled: 0, high_priority: 0 };
  for (const r of rows) {
    out[r.status] = (out[r.status] ?? 0) + 1;
    if ((r.priority?.severity ?? 0) >= 30 && (r.status === "open" || r.status === "in_progress")) {
      out.high_priority += 1;
    }
  }
  return out;
}
