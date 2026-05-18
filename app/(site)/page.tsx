import Link from "next/link";
import { Icons } from "../components/icons";

const MEETING_TIMES = [
  {
    day: "Sunday",
    sessions: [
      { time: "9:30 AM", label: "Adult Bible Study & Children's Ministry" },
      { time: "11:00 AM", label: "Congregational Singing & Preaching" },
    ],
  },
  {
    day: "Wednesday",
    sessions: [
      { time: "7:00 PM", label: "Adult Bible Study & Children's Ministry" },
    ],
  },
];

const EPISODES = [
  { title: "Majordomo", scripture: "Daniel 2:31–46", date: "April 18, 2015" },
  { title: "We're Losing Everything", scripture: "1 Peter 2:11–12", date: "April 11, 2015" },
  { title: "Not Talking About Practice", scripture: "Philippians 2:9–10", date: "March 29, 2015" },
  { title: "Judas Goat", scripture: "Hebrews 13:17", date: "March 14, 2015" },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="gw-hero" style={{
        background: "linear-gradient(135deg, var(--gw-ink) 0%, var(--gw-ink-3) 100%)",
        color: "#fff",
        padding: "96px 24px 88px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 50% 120%, rgba(108,140,89,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}/>
        <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 100, padding: "6px 16px",
            fontSize: 12, fontWeight: 700, letterSpacing: ".06em",
            textTransform: "uppercase", color: "var(--gw-rose-soft)",
            marginBottom: 32,
          }}>
            Millard Community Church
          </div>

          <h1 style={{
            margin: "0 0 24px",
            fontSize: "clamp(32px, 6vw, 60px)",
            fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.03em",
          }}>
            A local gathering of<br/>Christian believers
          </h1>

          <p style={{
            margin: "0 auto 40px",
            fontSize: "clamp(16px, 2vw, 19px)",
            lineHeight: 1.75,
            color: "rgba(255,255,255,.6)",
            maxWidth: 560,
          }}>
            Publicly identifying with the Lord Jesus Christ and one another.
            We are called to be the pillar and support of the truth.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/beliefs" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 14, fontWeight: 700,
            }}>
              What We Believe
              <Icons.ArrowRight width={14} height={14}/>
            </Link>
            <Link href="/messages" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 100,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.14)",
              color: "#fff", fontSize: 14, fontWeight: 700,
            }}>
              <Icons.Play width={13} height={13}/>
              Message Archive
            </Link>
          </div>
        </div>
      </section>

      {/* ── Meeting times ── */}
      <section style={{
        background: "var(--rsd-accent)",
        padding: "0 24px",
      }}>
        <div style={{
          maxWidth: 1000, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}>
          {MEETING_TIMES.map((block, bi) => (
            <div key={block.day} className="gw-times-block" style={{
              padding: "28px 0",
              borderRight: bi < MEETING_TIMES.length - 1 ? "1px solid rgba(44,4,8,.2)" : "none",
              paddingRight: bi < MEETING_TIMES.length - 1 ? 40 : 0,
              paddingLeft: bi > 0 ? 40 : 0,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".1em",
                textTransform: "uppercase", color: "var(--rsd-accent-on)",
                opacity: 0.6, marginBottom: 12,
              }}>
                {block.day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {block.sessions.map(s => (
                  <div key={s.time} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{
                      fontWeight: 800, fontSize: 20,
                      color: "var(--rsd-accent-on)", lineHeight: 1,
                      letterSpacing: "-.02em", flexShrink: 0,
                    }}>
                      {s.time}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: "var(--rsd-accent-on)", opacity: 0.7,
                      lineHeight: 1.3,
                    }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Address */}
          <div className="gw-times-address" style={{
            padding: "28px 0 28px 40px",
            borderLeft: "1px solid rgba(44,4,8,.2)",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 6,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: ".1em",
              textTransform: "uppercase", color: "var(--rsd-accent-on)", opacity: 0.6, marginBottom: 6,
            }}>
              Location
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Icons.MapPin width={14} height={14} style={{ color: "var(--rsd-accent-on)", opacity: 0.7, flexShrink: 0, marginTop: 2 }}/>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--rsd-accent-on)", lineHeight: 1.4 }}>
                9001 Q Street<br/>Omaha, NE 68127
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── About / Beliefs teaser ── */}
      <section className="gw-section" style={{ padding: "88px 24px", background: "var(--gw-bg)" }}>
        <div style={{
          maxWidth: 1000, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 56, alignItems: "center",
        }}>
          <div>
            <div className="rsd-eyebrow" style={{ marginBottom: 16 }}>Our Beliefs</div>
            <h2 style={{
              margin: "0 0 20px",
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15,
            }}>
              Salvation by grace,<br/>through faith alone.
            </h2>
            <p style={{
              margin: "0 0 12px",
              fontSize: 16, lineHeight: 1.8,
              color: "var(--gw-fg-muted)", fontWeight: 500,
            }}>
              We hold that the Bible teaches that there is salvation from the penalty of all sins committed by anyone on the basis of the grace of God through faith in Jesus Christ, only.
            </p>
            <p style={{
              margin: "0 0 32px",
              fontSize: 13, lineHeight: 1.6,
              color: "var(--gw-fg-faint)", fontWeight: 600,
              fontStyle: "italic",
            }}>
              Ephesians 2:8–10
            </p>
            <Link href="/beliefs" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "11px 24px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 13, fontWeight: 700,
            }}>
              All 7 Beliefs
              <Icons.ArrowRight width={13} height={13}/>
            </Link>
          </div>

          {/* Scripture card */}
          <div style={{
            background: "linear-gradient(135deg, var(--gw-ink) 0%, var(--gw-ink-3) 100%)",
            borderRadius: 20, padding: "40px 36px",
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(108,140,89,.2)",
              border: "1px solid rgba(108,140,89,.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--rsd-accent)",
            }}>
              <Icons.BookOpen width={18} height={18}/>
            </div>
            <blockquote style={{
              margin: 0,
              fontSize: "clamp(16px, 2vw, 19px)",
              lineHeight: 1.75,
              color: "rgba(255,255,255,.85)",
              fontWeight: 500,
            }}>
              "For by grace you have been saved through faith. And this is not your own doing; it is the gift of God."
            </blockquote>
            <div style={{
              fontSize: 12, fontWeight: 700,
              color: "rgba(255,255,255,.35)",
              letterSpacing: ".04em",
              textTransform: "uppercase",
            }}>
              Ephesians 2:8
            </div>
          </div>
        </div>
      </section>

      {/* ── Messages / Podcast ── */}
      <section className="gw-section" style={{ padding: "88px 24px", background: "var(--gw-bg-elev)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 36, flexWrap: "wrap", gap: 16,
          }}>
            <div>
              <div className="rsd-eyebrow" style={{ marginBottom: 10 }}>Biblically Speaking</div>
              <h2 style={{
                margin: 0,
                fontSize: "clamp(24px, 3.5vw, 36px)",
                fontWeight: 800, letterSpacing: "-.02em",
              }}>
                Recent Messages
              </h2>
            </div>
            <Link href="/messages" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 13, fontWeight: 700, color: "var(--rsd-accent)",
            }}>
              Full archive <Icons.ArrowRight width={13} height={13}/>
            </Link>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 14,
          }}>
            {EPISODES.map((ep, i) => (
              <div key={i} className="rsd-card gw-press" style={{ cursor: "pointer", gap: 14 }}>
                {/* Thumbnail */}
                <div style={{
                  width: "100%", aspectRatio: "16/9",
                  background: "linear-gradient(135deg, var(--gw-ink-2) 0%, var(--gw-ink-4) 100%)",
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "rgba(108,140,89,.18)",
                    border: "1px solid rgba(108,140,89,.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--rsd-accent)",
                  }}>
                    <Icons.Play width={16} height={16}/>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <h3 style={{
                    margin: 0, fontSize: 15, fontWeight: 700,
                    color: "var(--gw-fg)", lineHeight: 1.3,
                  }}>
                    {ep.title}
                  </h3>
                  <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                    {ep.scripture}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-faint)", fontWeight: 500 }}>
                    {ep.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location CTA ── */}
      <section className="gw-section" style={{
        padding: "88px 24px",
        background: "var(--gw-ink)",
        color: "#fff", textAlign: "center",
      }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h2 style={{
            margin: "0 0 12px",
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 800, letterSpacing: "-.02em",
          }}>
            Come as you are.
          </h2>
          <p style={{
            margin: "0 0 36px",
            fontSize: 17, color: "rgba(255,255,255,.6)", lineHeight: 1.75,
          }}>
            9001 Q Street · Omaha, NE 68127
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/assistance" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 100,
              background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
              fontSize: 14, fontWeight: 700,
            }}>
              <Icons.Wrench width={14} height={14}/>
              Request
            </Link>
            <Link href="/beliefs" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "13px 28px", borderRadius: 100,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.14)",
              color: "#fff", fontSize: 14, fontWeight: 700,
            }}>
              Our Beliefs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
