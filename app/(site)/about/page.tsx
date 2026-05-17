import { Icons } from "../../components/icons";

const VALUES = [
  { icon: <Icons.BookOpen width={20} height={20}/>, title: "Scripture-Centered", body: "We believe the Bible is the inspired Word of God and the foundation for how we live and grow." },
  { icon: <Icons.Heart width={20} height={20}/>, title: "Grace-Driven", body: "Everything we do flows from the grace we have received — and the grace we freely extend to others." },
  { icon: <Icons.Users width={20} height={20}/>, title: "Community-Focused", body: "We are better together. Genuine relationships are at the heart of who we are." },
  { icon: <Icons.MapPin width={20} height={20}/>, title: "Mission-Minded", body: "Our faith compels us outward — into our neighborhood, city, and world." },
];

const STAFF = [
  { name: "Pastor Jim", title: "Lead Pastor", initials: "PJ" },
  { name: "Sarah Mitchell", title: "Worship Director", initials: "SM" },
  { name: "Mark Hendricks", title: "Youth Pastor", initials: "MH" },
  { name: "Linda Ross", title: "Children's Ministry", initials: "LR" },
  { name: "Tom Garrett", title: "Executive Director", initials: "TG" },
  { name: "Amy Chen", title: "Connections Pastor", initials: "AC" },
];

export default function AboutPage() {
  return (
    <>
      {/* Page header */}
      <section style={{
        padding: "72px 24px 56px",
        background: "var(--gw-bg-elev)",
        borderBottom: "1px solid var(--gw-border)",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="rsd-eyebrow" style={{ marginBottom: 14 }}>Our Story</div>
          <h1 style={{ margin: "0 0 16px", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: "-.03em", lineHeight: 1.1 }}>
            About Millard Community Church
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>
            For over 30 years we have been planting roots and growing a community of faith in Millard, Nebraska.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 40, alignItems: "center",
          }}>
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 14 }}>Our Mission</div>
              <h2 style={{ margin: "0 0 20px", fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.2 }}>
                Know God. Grow Together. Serve Others.
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 16, color: "var(--gw-fg-muted)", lineHeight: 1.8, fontWeight: 500 }}>
                Millard Community Church exists to help people discover a life-changing relationship with Jesus Christ and to grow as his disciples in the context of a loving, authentic community.
              </p>
              <p style={{ margin: 0, fontSize: 16, color: "var(--gw-fg-muted)", lineHeight: 1.8, fontWeight: 500 }}>
                We believe every person matters to God and therefore matters to us. That conviction shapes everything — our worship, our programs, our relationships, and how we engage our city.
              </p>
            </div>
            <div style={{
              background: "linear-gradient(135deg, var(--rsd-accent-bg) 0%, var(--gw-bg-elev) 100%)",
              border: "1px solid rgba(244,63,94,.2)",
              borderRadius: 20,
              padding: 40,
              display: "flex", flexDirection: "column", gap: 24,
            }}>
              {[
                { label: "Years in Millard", value: "30+" },
                { label: "Weekly Attendees", value: "400+" },
                { label: "Ministry Programs", value: "12" },
                { label: "Community Served", value: "1,000s" },
              ].map(stat => (
                <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ fontSize: "clamp(28px, 4vw, 36px)", fontWeight: 800, color: "var(--rsd-accent)", lineHeight: 1, letterSpacing: "-.02em" }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg-elev)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>What We Believe</div>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 38px)", fontWeight: 800, letterSpacing: "-.02em" }}>
              Core Values
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
          }}>
            {VALUES.map(v => (
              <div key={v.title} className="rsd-card" style={{ gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 11,
                  background: "var(--rsd-accent-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--rsd-accent)",
                }}>
                  {v.icon}
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--gw-fg)" }}>{v.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500 }}>{v.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Staff */}
      <section style={{ padding: "72px 24px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div className="rsd-eyebrow" style={{ marginBottom: 12 }}>The Team</div>
            <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.5vw, 38px)", fontWeight: 800, letterSpacing: "-.02em" }}>
              Our Staff
            </h2>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 16,
          }}>
            {STAFF.map(s => (
              <div key={s.name} className="rsd-card" style={{ alignItems: "center", textAlign: "center", gap: 12 }}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: "var(--rsd-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, fontSize: 18, color: "var(--rsd-accent-on)",
                  letterSpacing: ".02em",
                }}>
                  {s.initials}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gw-fg)" }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, marginTop: 3 }}>{s.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
