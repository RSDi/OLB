import Link from "next/link";
import { Icons } from "../../components/icons";

const SERVICES = [
  {
    day: "Sunday",
    times: [
      { time: "9:00 AM", note: "Traditional service · 60 min" },
      { time: "10:45 AM", note: "Contemporary service · 75 min" },
    ],
  },
  {
    day: "Wednesday",
    times: [
      { time: "6:30 PM", note: "Midweek Bible study · 60 min" },
    ],
  },
];

const EXPECT = [
  { icon: <Icons.Music width={20} height={20}/>, title: "Worship", body: "Engaging, spirit-filled worship led by our talented team. Bring your voice." },
  { icon: <Icons.BookOpen width={20} height={20}/>, title: "Message", body: "Practical, scripture-based teaching relevant to everyday life." },
  { icon: <Icons.Users width={20} height={20}/>, title: "Community", body: "Warm, welcoming people who are genuinely glad you are here." },
  { icon: <Icons.Heart width={20} height={20}/>, title: "Kids Ministry", body: "Safe, engaging children's programming for newborns through 5th grade." },
];

export default function ServicesPage() {
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
          <div className="rsd-eyebrow" style={{ marginBottom: 14 }}>Join Us</div>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1 }}>
            Services & Times
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>
            We meet every week to worship, learn, and grow together. All are welcome.
          </p>
        </div>
      </section>

      {/* Service times */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>Weekly Schedule</div>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 36px)", fontWeight: 800, letterSpacing: "-.02em" }}>
              Service Times
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {SERVICES.map(s => (
              <div key={s.day} className="rsd-card" style={{ gap: 0 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 12,
                  paddingBottom: 16, borderBottom: "1px solid var(--gw-border)",
                  marginBottom: 16,
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: "var(--rsd-accent-bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--rsd-accent)",
                  }}>
                    <Icons.Calendar width={18} height={18}/>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "var(--gw-fg)" }}>{s.day}</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {s.times.map(t => (
                    <div key={t.time} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                        <Icons.Clock width={14} height={14} style={{ color: "var(--rsd-accent)", flexShrink: 0 }}/>
                        <span style={{ fontWeight: 800, fontSize: 18, color: "var(--gw-fg)", letterSpacing: "-.01em" }}>
                          {t.time}
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{t.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What to expect */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg-elev)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>First Time?</div>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 36px)", fontWeight: 800, letterSpacing: "-.02em" }}>
              What to Expect
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}>
            {EXPECT.map(e => (
              <div key={e.title} className="rsd-card" style={{ gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: "var(--rsd-accent-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--rsd-accent)",
                }}>
                  {e.icon}
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{e.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>{e.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>Find Us</div>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 36px)", fontWeight: 800, letterSpacing: "-.02em" }}>
              Location
            </h2>
          </div>
          <div className="rsd-card" style={{ gap: 24 }}>
            {/* Map placeholder */}
            <div style={{
              width: "100%", height: 240,
              background: "linear-gradient(135deg, var(--gw-ink-3) 0%, var(--gw-ink-4) 100%)",
              borderRadius: 12,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "rgba(255,255,255,.4)",
              gap: 10,
            }}>
              <Icons.MapPin width={24} height={24}/>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Map coming soon</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { icon: <Icons.MapPin width={16} height={16}/>, label: "Address", value: "Millard, Nebraska — exact address to be added" },
                { icon: <Icons.Phone width={16} height={16}/>, label: "Phone", value: "(402) 000-0000" },
                { icon: <Icons.Mail width={16} height={16}/>, label: "Email", value: "info@millardcommunitychurch.com" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: "var(--rsd-accent-bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--rsd-accent)", flexShrink: 0,
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 3 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)" }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
