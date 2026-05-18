import { Icons } from "../../components/icons";

const SERIES = ["All", "Foundations", "Guest", "Special"];

const SERMONS = [
  { title: "Walking in Faith", series: "Foundations", speaker: "Jim", date: "May 11, 2025", duration: "42 min", tag: "Series" },
  { title: "The Power of Community", series: "Foundations", speaker: "Jim", date: "May 4, 2025", duration: "38 min", tag: "Series" },
  { title: "Grace That Transforms", series: "Foundations", speaker: "Guest Speaker", date: "Apr 27, 2025", duration: "45 min", tag: "Guest" },
  { title: "Hope Anchors the Soul", series: "Foundations", speaker: "Jim", date: "Apr 20, 2025", duration: "41 min", tag: "Series" },
  { title: "The Prodigal Returns", series: "Foundations", speaker: "Jim", date: "Apr 13, 2025", duration: "39 min", tag: "Series" },
  { title: "Good Friday Reflection", series: "Special", speaker: "Jim", date: "Apr 18, 2025", duration: "30 min", tag: "Special" },
];

const chipClass = (tag: string) =>
  tag === "Guest" ? "rsd-chip rsd-chip-mute"
  : tag === "Special" ? "rsd-chip rsd-chip-success"
  : "rsd-chip rsd-chip-accent";

export default function MessagesPage() {
  return (
    <>
      {/* Header */}
      <section style={{
        padding: "72px 24px 56px",
        background: "var(--gw-bg-elev)",
        borderBottom: "1px solid var(--gw-border)",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1 }}>
            Messages
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>
            Watch or listen to our recent messages. Catch up on a series or share with a friend.
          </p>
        </div>
      </section>

      {/* Filter + grid */}
      <section style={{ padding: "48px 24px 80px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          {/* Filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, flexWrap: "wrap" }}>
            <div className="rsd-seg">
              {SERIES.map(s => (
                <button key={s} aria-pressed={s === "All"}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 20,
          }}>
            {SERMONS.map((s, i) => (
              <div key={i} className="rsd-card gw-press" style={{ cursor: "pointer", gap: 14 }}>
                {/* Thumbnail */}
                <div style={{
                  width: "100%", aspectRatio: "16/7",
                  background: "linear-gradient(135deg, var(--gw-ink-2) 0%, var(--gw-ink-4) 100%)",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: "50%",
                    background: "rgba(108,140,89,.2)",
                    border: "1px solid rgba(108,140,89,.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--rsd-accent)",
                  }}>
                    <Icons.Play width={20} height={20}/>
                  </div>
                  <div style={{
                    position: "absolute", bottom: 10, right: 10,
                    background: "rgba(0,0,0,.6)", borderRadius: 6,
                    padding: "3px 8px", fontSize: 11, fontWeight: 700, color: "#fff",
                  }}>
                    {s.duration}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={chipClass(s.tag)}>{s.tag}</span>
                  <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{s.date}</span>
                </div>

                {/* Title */}
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.35 }}>
                  {s.title}
                </h3>

                {/* Speaker + series */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: "var(--rsd-accent)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 800, color: "var(--rsd-accent-on)",
                    }}>
                      {s.speaker.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{s.speaker}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--gw-fg-faint)", fontWeight: 500 }}>{s.series}</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, paddingTop: 4, borderTop: "1px solid var(--gw-border)" }}>
                  <button style={{
                    flex: 1, height: 34, borderRadius: 100,
                    background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
                    border: "none", fontSize: 12, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <Icons.Play width={12} height={12}/> Watch
                  </button>
                  <button style={{
                    flex: 1, height: 34, borderRadius: 100,
                    background: "var(--gw-bg)", border: "1px solid var(--gw-border)",
                    fontSize: 12, fontWeight: 700, color: "var(--gw-fg)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    <Icons.Music width={12} height={12}/> Audio
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
