import { Icons } from "../../components/icons";

const DOCS = [
  { title: "Sunday Morning Runsheet", category: "Worship", updated: "May 10, 2025", author: "Jeff M.", excerpt: "Step-by-step timeline for Sunday services including tech, worship team, and hospitality cues." },
  { title: "Facilities Opening & Closing", category: "Facilities", updated: "Apr 28, 2025", author: "Andy M.", excerpt: "Checklist for opening and closing the building — lights, HVAC, security, and locks." },
  { title: "AV & Sound System Guide", category: "Tech", updated: "Apr 20, 2025", author: "Jerod S.", excerpt: "How to set up and operate the audio/visual system for services and events." },
  { title: "Emergency Response Procedures", category: "Safety", updated: "Mar 15, 2025", author: "Jeff M.", excerpt: "What to do in a medical emergency, fire, severe weather, or security incident." },
  { title: "Volunteer Onboarding", category: "People", updated: "Mar 5, 2025", author: "Andy M.", excerpt: "Overview of volunteer roles, expectations, background check process, and training." },
  { title: "Youth Ministry Guidelines", category: "Youth", updated: "Feb 22, 2025", author: "Jerod S.", excerpt: "Policies and procedures for working with minors, ratios, check-in/out, and safety." },
];

const catColor = (c: string) => {
  if (c === "Worship")    return { bg: "var(--rsd-accent-bg)", color: "var(--rsd-accent)" };
  if (c === "Facilities") return { bg: "rgb(254,243,199)", color: "#92400e" };
  if (c === "Tech")       return { bg: "rgb(239,246,255)", color: "#1d4ed8" };
  if (c === "Safety")     return { bg: "var(--gw-error-bg)", color: "var(--gw-error)" };
  if (c === "People")     return { bg: "var(--gw-success-bg)", color: "#16a34a" };
  if (c === "Youth")      return { bg: "rgb(243,232,255)", color: "#6d28d9" };
  return { bg: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" };
};

export default function PortalDocsPage() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>Operations</div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Playbooks</h2>
        </div>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 100,
          background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
          border: "none", fontSize: 13, fontWeight: 700,
        }}>
          <Icons.FileText width={14} height={14}/>
          New Document
        </button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 16,
      }}>
        {DOCS.map((doc, i) => {
          const { bg, color } = catColor(doc.category);
          return (
            <div key={i} className="rsd-card gw-press" style={{ cursor: "pointer", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: bg, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color,
                }}>
                  <Icons.BookOpen width={18} height={18}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gw-fg)", lineHeight: 1.3 }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
                    Updated {doc.updated} · {doc.author}
                  </div>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.65, fontWeight: 500 }}>
                {doc.excerpt}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--gw-border)" }}>
                <span className="rsd-chip" style={{ background: bg, color, borderColor: "transparent" }}>{doc.category}</span>
                <span style={{ fontSize: 12, color: "var(--rsd-accent)", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  Open <Icons.ArrowRight width={12} height={12}/>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
