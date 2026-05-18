import Link from "next/link";
import { Icons } from "../components/icons";
import { KpiCard } from "../components/ui";

const RECENT_REQUESTS = [
  { id: 1, title: "HVAC not cooling — Main Meeting Room", location: "Main Meeting Room", priority: "high", status: "open", submitted: "May 16", submitter: "Jeff M." },
  { id: 2, title: "Light bulb out — Hallway B", location: "Offices", priority: "low", status: "in_progress", submitted: "May 15", submitter: "Andy M." },
  { id: 3, title: "Sink dripping — Women's restroom", location: "Restrooms", priority: "medium", status: "open", submitted: "May 14", submitter: "Jeff M." },
  { id: 4, title: "Projector bulb dim — Main Meeting Room", location: "Main Meeting Room", priority: "medium", status: "open", submitted: "May 13", submitter: "Jerod S." },
];

const UPCOMING_EVENTS = [
  { name: "Sunday Morning Services", date: "May 18", time: "9:00 AM & 10:45 AM" },
  { name: "Youth Group", date: "May 21", time: "6:30 PM" },
  { name: "Women's Bible Study", date: "May 22", time: "10:00 AM" },
  { name: "Building Committee Meeting", date: "May 26", time: "7:00 PM" },
];

const priorityChip = (p: string) => {
  if (p === "emergency") return <span className="rsd-chip rsd-chip-error">Emergency</span>;
  if (p === "high")      return <span className="rsd-chip rsd-chip-warn">High</span>;
  if (p === "medium")    return <span className="rsd-chip rsd-chip-mute">Medium</span>;
  return <span className="rsd-chip rsd-chip-success">Low</span>;
};

const statusChip = (s: string) => {
  if (s === "open")        return <span className="rsd-chip rsd-chip-warn">Open</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
};

export default function PortalDashboard() {
  return (
    <>
      {/* KPIs */}
      <div className="rsd-kpi-grid">
        <KpiCard label="Open Requests" value="4" sub="2 high priority" accent />
        <KpiCard label="Completed This Month" value="12" sub="vs 9 last month" />
        <KpiCard label="Upcoming Events" value="8" sub="Next 30 days" />
        <KpiCard label="Playbooks" value="6" sub="Ops documents" />
      </div>

      {/* Quick actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/assistance" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 100,
          background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          <Icons.ArrowRight width={14} height={14}/>
          Assistance
        </Link>
        <Link href="/portal/maintenance" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 100,
          background: "var(--gw-bg-elev)", border: "1px solid var(--gw-border)",
          fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none",
        }}>
          <Icons.Wrench width={14} height={14}/>
          View All Requests
        </Link>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "var(--rsd-gap)" }}>
        {/* Recent maintenance */}
        <div className="rsd-card" style={{ gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Facilities</div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Recent Requests</h3>
            </div>
            <Link href="/portal/maintenance" style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {RECENT_REQUESTS.map((r, i) => (
              <div key={r.id} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 0",
                borderBottom: i < RECENT_REQUESTS.length - 1 ? "1px solid var(--gw-border)" : "none",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: "var(--gw-bg)", border: "1px solid var(--gw-border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--gw-fg-muted)", flexShrink: 0,
                }}>
                  <Icons.Wrench width={14} height={14}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 3 }}>
                    {r.location} · {r.submitted} · {r.submitter}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {priorityChip(r.priority)}
                  {statusChip(r.status)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming events */}
        <div className="rsd-card" style={{ gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Schedule</div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Upcoming Events</h3>
            </div>
            <Link href="/portal/events" style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {UPCOMING_EVENTS.map((e, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 0",
                borderBottom: i < UPCOMING_EVENTS.length - 1 ? "1px solid var(--gw-border)" : "none",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: "var(--rsd-accent-bg)", border: "1px solid rgba(108,140,89,.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--rsd-accent)", flexShrink: 0,
                }}>
                  <Icons.Calendar width={14} height={14}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 3 }}>
                    {e.date} · {e.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
