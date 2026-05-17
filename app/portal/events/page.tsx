import { Icons } from "../../components/icons";

const EVENTS = [
  { name: "Sunday Morning Services", date: "May 18, 2025", time: "9:00 AM & 10:45 AM", location: "Sanctuary", category: "Worship", recurring: true },
  { name: "Youth Group", date: "May 21, 2025", time: "6:30 PM", location: "Youth Room", category: "Youth", recurring: true },
  { name: "Women's Bible Study", date: "May 22, 2025", time: "10:00 AM", location: "Fellowship Hall", category: "Study", recurring: true },
  { name: "Deacon Meeting", date: "May 26, 2025", time: "7:00 PM", location: "Offices", category: "Admin", recurring: false },
  { name: "Sunday Morning Services", date: "May 25, 2025", time: "9:00 AM & 10:45 AM", location: "Sanctuary", category: "Worship", recurring: true },
  { name: "Community Cookout", date: "Jun 1, 2025", time: "12:00 PM", location: "Parking Lot", category: "Outreach", recurring: false },
];

const catColor = (c: string) => {
  if (c === "Worship")  return { bg: "var(--rsd-accent-bg)", color: "var(--rsd-accent)" };
  if (c === "Youth")    return { bg: "var(--gw-success-bg)", color: "#16a34a" };
  if (c === "Study")    return { bg: "rgb(239,246,255)", color: "#1d4ed8" };
  if (c === "Admin")    return { bg: "var(--gw-bg)", color: "var(--gw-fg-muted)" };
  if (c === "Outreach") return { bg: "rgb(254,243,199)", color: "#92400e" };
  return { bg: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" };
};

export default function PortalEventsPage() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Calendar</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Events</h2>
        </div>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 100,
          background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
          border: "none", fontSize: 13, fontWeight: 700,
        }}>
          <Icons.Calendar width={14} height={14}/>
          Add Event
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {EVENTS.map((e, i) => {
          const { bg, color } = catColor(e.category);
          return (
            <div key={i} className="rsd-card gw-press" style={{ flexDirection: "row", alignItems: "center", gap: 16, cursor: "pointer", padding: "16px 20px" }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: bg, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color,
              }}>
                <Icons.Calendar width={20} height={20}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gw-fg)", marginBottom: 4 }}>{e.name}</div>
                <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Icons.Clock width={11} height={11}/> {e.date} · {e.time}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Icons.MapPin width={11} height={11}/> {e.location}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {e.recurring && <span className="rsd-chip rsd-chip-mute">Recurring</span>}
                <span className="rsd-chip" style={{ background: bg, color, borderColor: "transparent" }}>{e.category}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
