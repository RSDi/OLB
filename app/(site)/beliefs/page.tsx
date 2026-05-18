import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beliefs — Millard Community Church",
  description: "What Millard Community Church believes about Jesus Christ, salvation, baptism, and more.",
};

const BELIEFS = [
  {
    num: "01",
    title: "Lord Jesus Christ",
    refs: ["Matthew 1:23", "Genesis 3:16", "Colossians 1:3", "Colossians 2:10", "John 10:18", "1st John 1:5", "Ephesians 1:18-23", "Revelation 20:6-15"],
    body: [
      "The Lord Jesus Christ is God incarnate. The fulfillment of the great prophecy concerning The Coming Redeemer, the eternal Word of God, became flesh through the overshadowing of Mary by the Holy Spirit.",
      "Mary remained a virgin until birthing Jesus, preserved by Joseph. Christ embodies the very image of the invisible God, the exact representation of His Being, and the full expression of His Person.",
      "He ever has known all things, and has power over life and death. He had power to lay His life down — which He did — and power to take it up again, which He also did.",
      "He lived an impeccable life, having an impeccable and sinless nature, and therefore character. The Lord Jesus Christ could not ever and did not ever sin.",
      "After resurrection in a glorified physical body, He ascended to heaven and was crowned above angels. He has elevated in Himself a new humanity above the angels and serves as head of the church. His future return is affirmed, with a thousand-year reign and final judgment of all humanity.",
    ],
  },
  {
    num: "02",
    title: "Salvation",
    refs: ["Romans 4:3", "Romans 6:23", "Romans 10:10", "Ephesians 2:8-9"],
    body: [
      "There is salvation from the penalty of all sins committed by anyone on the basis of the grace of God through faith in Jesus Christ, only.",
      "Grace operates from God's nature independent of the recipient's merit. The gift of God is eternal life, distributed freely.",
      'Faith is the same as belief. The Bible says "with the heart man believes." Therefore, there is no such thing as "head faith" as distinguishable from "heart faith."',
      "Salvation rests on Christ's meritorious cross-work as vicarious substitute. Personal faith appropriates this objective accomplishment.",
    ],
  },
  {
    num: "03",
    title: "Water Baptism",
    refs: ["Ephesians 4:5", "Acts 19:1-5", "Acts 8:36-39"],
    body: [
      "Scripture teaches one baptism practiced in Ephesus — water immersion following personal faith conversion, not John's baptism or spirit baptism.",
      "We reject infant sprinkling or pouring and affirm immersion after conversion. No special power inheres in the baptizer.",
      "Baptism occurs publicly within the local church context, administered by ordinary believers.",
    ],
  },
  {
    num: "04",
    title: "No Clergy",
    refs: ["Matthew 23:8-9", "John 10:11-14"],
    body: [
      "The Bible nowhere allows for a clergy class, nor are salary arrangements ever practiced anywhere in the Scriptures except by those who do not accept the Lord Jesus Christ.",
      "The church maintains no ordained clergy and actively opposes establishing one.",
    ],
  },
  {
    num: "05",
    title: "No Collections",
    refs: ["1st Corinthians 16:1-2", "3 John 1:7", "Psalm 50:7-15"],
    body: [
      "In the New Testament, the apostle Paul took measures to make sure there were NOT collections taken at Christian gatherings. So do we.",
      "No collections or fundraising occur at our gatherings. Christian ministry proceeds without unbeliever contributions. God does not need any money.",
    ],
  },
  {
    num: "06",
    title: "Charismatic Gifts and Pentecost",
    refs: ["1st Corinthians 12", "1st Corinthians 13:8-13", "1st Corinthians 14:39", "Acts 2:1"],
    body: [
      "Biblical charismatic gifts are affirmed, but contemporary manifestations labeled as such are rejected as human imagination or demonic. Speaking in tongues is permitted only when coherent.",
      "Pentecost was completed as recorded in Acts; Passover was fulfilled through Christ's redemptive work circa 29 AD.",
    ],
  },
  {
    num: "07",
    title: "Communion",
    refs: ["Romans 10:17", "1st Corinthians 11"],
    body: [
      '"Communion" translates as fellowship grounded in shared faith accessed through God\'s Word. The Lord\'s Supper remembers Christ through two symbols: bread and cup.',
      "Four symbols in total: the woman's head covering, water baptism, bread, and cup.",
    ],
  },
];

export default function BeliefsPage() {
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
          <h1 style={{
            margin: "0 0 16px",
            fontSize: "clamp(32px, 5vw, 56px)",
            fontWeight: 800, lineHeight: 1.05, letterSpacing: "-.03em",
          }}>
            What We Believe
          </h1>
          <p style={{
            margin: 0, fontSize: 18,
            color: "var(--gw-fg-muted)", lineHeight: 1.7, fontWeight: 500,
          }}>
            The following statements represent the core doctrinal convictions of Millard Community Church, grounded in Scripture.
          </p>
        </div>
      </section>

      {/* Beliefs list */}
      <section className="gw-section-b" style={{ padding: "64px 24px 96px", background: "var(--gw-bg)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 0 }}>
          {BELIEFS.map((belief, i) => (
            <div
              key={belief.num}
              className="beliefs-grid"
              style={{
                padding: "56px 0",
                borderBottom: i < BELIEFS.length - 1 ? "1px solid var(--gw-border)" : "none",
              }}
            >
              {/* Left: number + title + refs */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <span style={{
                  fontWeight: 800, fontSize: 13,
                  letterSpacing: ".08em", color: "var(--gw-fg-faint)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {belief.num}
                </span>
                <h2 style={{
                  margin: 0,
                  fontSize: "clamp(18px, 2vw, 22px)",
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  lineHeight: 1.2,
                  color: "var(--gw-fg)",
                }}>
                  {belief.title}
                </h2>
                <div style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  padding: "14px 16px",
                  border: "1px solid rgba(108,140,89,.2)",
                  borderRadius: 10,
                  background: "var(--rsd-accent-bg)",
                }}>
                  {belief.refs.map(ref => (
                    <span key={ref} style={{
                      fontSize: 12, fontWeight: 600,
                      color: "var(--rsd-accent)",
                      lineHeight: 1.4,
                    }}>
                      {ref}
                    </span>
                  ))}
                </div>
              </div>

              {/* Right: body */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
                {belief.body.map((para, j) => (
                  <p key={j} style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.85,
                    color: "var(--gw-fg-muted)",
                    fontWeight: 500,
                  }}>
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

    </>
  );
}
