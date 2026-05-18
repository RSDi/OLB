import Link from "next/link";
import { Icons } from "../../components/icons";

const REQUESTS = [
  { id: 1, title: "HVAC not cooling — Main Meeting Room", location: "Main Meeting Room", priority: "high", status: "open", submitted: "May 16, 2025", submitter: "Jeff M.", description: "The air conditioning in the main meeting room is blowing warm air. Noticed during Sunday morning service." },
  { id: 2, title: "Light bulb out — Hallway B", location: "Offices", priority: "low", status: "in_progress", submitted: "May 15, 2025", submitter: "Andy M.", description: "The fluorescent light in hallway B near the copy room is flickering and needs replacement." },
  { id: 3, title: "Sink dripping — Women's restroom", location: "Restrooms", priority: "medium", status: "open", submitted: "May 14, 2025", submitter: "Jeff M.", description: "The faucet in the women's restroom has a slow drip." },
  { id: 4, title: "Projector bulb dim — Main Meeting Room", location: "Main Meeting Room", priority: "medium", status: "open", submitted: "May 13, 2025", submitter: "Jerod S.", description: "The main projector bulb is noticeably dimmer than usual. May need replacement soon." },
  { id: 5, title: "Exit sign light out — Side door", location: "Exterior / Grounds", priority: "high", status: "open", submitted: "May 12, 2025", submitter: "Jeff M.", description: "The exit sign light above the south side door is not working. This may be a code issue." },
  { id: 6, title: "Broken chair — Youth Room", location: "Youth Room", priority: "low", status: "done", submitted: "May 10, 2025", submitter: "Jerod S.", description: "One of the folding chairs has a broken leg and should be removed from rotation." },
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

export default function PortalMaintenancePage() {
  return (
    <>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Facilities</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Maintenance Requests</h2>
        </div>
        <Link href="/assistance/maintenance" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 100,
          background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
          fontSize: 13, fontWeight: 700, textDecoration: "none",
        }}>
          <Icons.ArrowRight width={14} height={14}/>
          Public Request Form
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "Open", count: REQUESTS.filter(r => r.status === "open").length, chip: "rsd-chip-warn" },
          { label: "In Progress", count: REQUESTS.filter(r => r.status === "in_progress").length, chip: "rsd-chip-accent" },
          { label: "Done", count: REQUESTS.filter(r => r.status === "done").length, chip: "rsd-chip-success" },
          { label: "High Priority", count: REQUESTS.filter(r => r.priority === "high" || r.priority === "emergency").length, chip: "rsd-chip-error" },
        ].map(s => (
          <div key={s.label} className="rsd-card" style={{ padding: "14px 20px", gap: 6, flexDirection: "row", alignItems: "center" }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", letterSpacing: "-.02em" }}>{s.count}</span>
            <span className={`rsd-chip ${s.chip}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>All Requests</h3>
        </div>
        <table className="rsd-tbl">
          <thead>
            <tr>
              <th>Request</th>
              <th>Location</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {REQUESTS.map(r => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--gw-fg)" }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2, maxWidth: 340 }}>
                    {r.description}
                  </div>
                </td>
                <td>{r.location}</td>
                <td>{priorityChip(r.priority)}</td>
                <td>{statusChip(r.status)}</td>
                <td style={{ whiteSpace: "nowrap" }}>{r.submitted}</td>
                <td>{r.submitter}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
