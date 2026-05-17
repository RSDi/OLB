import Link from "next/link";
import { Icons } from "../components/icons";

const SERVICE_TIMES = [
  { label: "Sunday Morning", times: ["9:00 AM", "10:45 AM"], note: "Children's ministry available" },
  { label: "Wednesday Evening", times: ["6:30 PM"], note: "Bible study & youth group" },
];

const PILLARS = [
  {
    icon: <Icons.Heart width={24} height={24}/>,
    title: "Worship Together",
    body: "Experience authentic, spirit-filled worship every Sunday. All are welcome at every service.",
  },
  {
    icon: <Icons.Users width={24} height={24}/>,
    title: "Grow in Community",
    body: "Life groups, Bible studies, and events designed to help you build real relationships.",
  },
  {
    icon: <Icons.MapPin width={24} height={24}/>,
    title: "Serve Millard",
    body: "We believe faith is lived out in action. Join us in serving our neighborhood and city.",
  },
];

const SERMONS = [
  { title: "Walking in Faith", series: "Foundations", speaker: "Pastor Jim", date: "May 11, 2025", tag: "Series" },
  { title: "The Power of Community", series: "Foundations", speaker: "Pastor Jim", date: "May 4, 2025", tag: "Series" },
  { title: "Grace That Transforms", series: "Foundations", speaker: "Guest Speaker", date: "Apr 27, 2025", tag: "Guest" },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section style={{
        background: "linear-gradient(135deg, var(--gw-ink) 0%, var(--gw-ink-3) 100%)",
        color: "#fff",
        padding: "96px 24px 80px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 50% 120%, rgba(244,63,94,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 100, padding: "6px 14px",
            fontSize: 12, fontWeight: 700, letterSpacing: ".05em",
            textTransform: "uppercase", color: "var(--gw-rose-soft)",
            marginBottom: 28,
          }}>
            <Icons.Cross width={11} height={11}/>
            Millard Community Church
          </div>
          <h1 style={{
            margin: "0 0 20px",
            fontSize: "clamp(36px, 6vw, 64px)",
            fontWeight: 800, lineHeight: 1.1,
            letterSpacing: "-.03em",
          }}>
            Welcome Home
          </h1>
          <p style={{
            margin: "0 auto 40px",
            fontSize: "clamp(16px, 2vw, 20px)",
            lineHeight: 1.7,
            color: "rgba(255,255,255,.65)",
            maxWidth: 540,
          }}>
            A community of faith in Millard, Nebraska. Wherever you are on your journey, there is a place for you here.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/services" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 15, fontWeight: 700,
            }}>
              Plan Your Visit
              <Icons.ArrowRight width={15} height={15}/>
            </Link>
            <Link href="/sermons" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px", borderRadius: 100,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.15)",
              color: "#fff",
              fontSize: 15, fontWeight: 700,
            }}>
              <Icons.Play width={14} height={14}/>
              Watch Sermons
            </Link>
          </div>
        </div>
      </section>

      {/* Service times strip */}
      <section style={{
        background: "var(--rsd-accent)",
        padding: "20px 24px",
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          display: "flex", alignItems: "center", gap: 32,
          flexWrap: "wrap", justifyContent: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--rsd-accent-on)" }}>
            <Icons.Clock width={16} height={16}/>
            <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Service Times
            </span>
          </div>
          {SERVICE_TIMES.map(s => (
            <div key={s.label} style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--rsd-accent-on)" }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{s.label}:</span>
              <span style={{ fontWeight: 600, fontSize: 14, opacity: 0.8 }}>{s.times.join(" & ")}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section style={{ padding: "80px 24px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>What We Are About</div>
            <h2 style={{ margin: 0, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-.02em", color: "var(--gw-fg)" }}>
              Faith. Community. Service.
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}>
            {PILLARS.map(p => (
              <div key={p.title} className="rsd-card" style={{ gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: "var(--rsd-accent-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--rsd-accent)",
                }}>
                  {p.icon}
                </div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                  {p.title}
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent sermons */}
      <section style={{ padding: "80px 24px", background: "var(--gw-bg-elev)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 10 }}>Latest Sermons</div>
              <h2 style={{ margin: 0, fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, letterSpacing: "-.02em" }}>
                Recent Messages
              </h2>
            </div>
            <Link href="/sermons" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, color: "var(--rsd-accent)",
            }}>
              View all sermons <Icons.ArrowRight width={14} height={14}/>
            </Link>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}>
            {SERMONS.map((s, i) => (
              <Link key={i} href="/sermons" style={{ textDecoration: "none" }}>
                <div className="rsd-card gw-press" style={{
                  cursor: "pointer",
                  transition: "box-shadow 200ms var(--gw-ease)",
                }}>
                  <div style={{
                    width: "100%", aspectRatio: "16/7",
                    background: "linear-gradient(135deg, var(--gw-ink-2) 0%, var(--gw-ink-4) 100%)",
                    borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: "rgba(244,63,94,.2)",
                      border: "1px solid rgba(244,63,94,.3)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--rsd-accent)",
                    }}>
                      <Icons.Play width={18} height={18}/>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="rsd-chip rsd-chip-accent">{s.tag}</span>
                      <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{s.date}</span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                      {s.title}
                    </h3>
                    <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                      {s.speaker} · {s.series}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section style={{
        padding: "80px 24px",
        background: "var(--gw-ink)",
        textAlign: "center",
        color: "#fff",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ margin: "0 0 16px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-.02em" }}>
            Ready to join us?
          </h2>
          <p style={{ margin: "0 0 36px", fontSize: 16, color: "rgba(255,255,255,.65)", lineHeight: 1.7 }}>
            We would love to meet you. Come as you are — all are welcome at Millard Community Church.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/services" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 15, fontWeight: 700,
            }}>
              <Icons.MapPin width={15} height={15}/>
              Find Us
            </Link>
            <Link href="/about" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "14px 28px", borderRadius: 100,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.15)",
              color: "#fff", fontSize: 15, fontWeight: 700,
            }}>
              Learn More
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
