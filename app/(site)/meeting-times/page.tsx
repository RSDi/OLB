import type { Metadata } from "next";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { MarkdownView } from "../../components/MarkdownView";
import { getActiveClosure } from "../../../lib/closures/data";
import { CHURCH_ADDRESS, MEETING_TIMES } from "../schedule";

export const metadata: Metadata = {
  title: "Meeting Times — Millard Community Church",
  description:
    "When and where Millard Community Church meets — and any changes to this week's schedule.",
};

// This is the page behind the permanent QR code on the door sign — someone is
// standing at the building reading it on their phone, so it must never serve
// a stale answer.
export const dynamic = "force-dynamic";

export default async function MeetingTimesPage() {
  const closure = await getActiveClosure();
  return closure ? <NotMeeting title={closure.title} bodyMd={closure.body_md} /> : <Meeting />;
}

function NotMeeting({ title, bodyMd }: { title: string; bodyMd: string }) {
  return (
    <>
      <section style={{
        background: "linear-gradient(135deg, var(--gw-ink) 0%, var(--gw-ink-3) 100%)",
        color: "#fff",
        padding: "72px 24px 64px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 18px", borderRadius: 100, marginBottom: 24,
            background: "rgba(255,255,255,.08)",
            border: "1px solid rgba(255,255,255,.14)",
            fontSize: 12, fontWeight: 800, letterSpacing: ".08em",
            textTransform: "uppercase", color: "rgba(255,255,255,.75)",
          }}>
            {title}
          </div>
          <h1 style={{
            margin: "0 0 16px",
            fontSize: "clamp(30px, 6vw, 52px)",
            fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.03em",
          }}>
            We&rsquo;re not meeting today
          </h1>
          <p style={{
            margin: 0,
            fontSize: "clamp(15px, 2vw, 18px)",
            lineHeight: 1.75,
            color: "rgba(255,255,255,.6)",
          }}>
            We apologize for the inconvenience — here&rsquo;s what&rsquo;s going on.
          </p>
        </div>
      </section>

      <section style={{ padding: "56px 24px", background: "var(--gw-bg)" }}>
        <div className="rsd-card" style={{
          maxWidth: 620, margin: "0 auto", padding: "32px 32px",
          fontSize: 16, lineHeight: 1.8,
        }}>
          <MarkdownView>{bodyMd}</MarkdownView>
        </div>
      </section>

      <RegularSchedule heading="When we normally meet" />
    </>
  );
}

function Meeting() {
  return (
    <>
      <section style={{
        background: "linear-gradient(135deg, var(--gw-ink) 0%, var(--gw-ink-3) 100%)",
        color: "#fff",
        padding: "72px 24px 64px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "8px 18px", borderRadius: 100, marginBottom: 24,
            background: "rgba(108,140,89,.2)",
            border: "1px solid rgba(108,140,89,.35)",
            fontSize: 12, fontWeight: 800, letterSpacing: ".08em",
            textTransform: "uppercase", color: "var(--rsd-accent)",
          }}>
            Meeting as scheduled
          </div>
          <h1 style={{
            margin: "0 0 16px",
            fontSize: "clamp(30px, 6vw, 52px)",
            fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.03em",
          }}>
            When we meet
          </h1>
          <p style={{
            margin: 0,
            fontSize: "clamp(15px, 2vw, 18px)",
            lineHeight: 1.75,
            color: "rgba(255,255,255,.6)",
          }}>
            Everyone is welcome — come as you are.
          </p>
        </div>
      </section>

      <RegularSchedule heading="Our regular meeting times" />
    </>
  );
}

function RegularSchedule({ heading }: { heading: string }) {
  return (
    <section style={{ padding: "56px 24px 72px", background: "var(--gw-bg-elev)" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div className="rsd-eyebrow" style={{ marginBottom: 16, textAlign: "center" }}>
          {heading}
        </div>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}>
          {MEETING_TIMES.map((block) => (
            <div key={block.day} className="rsd-card" style={{ gap: 12, padding: "22px 24px" }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: ".1em",
                textTransform: "uppercase", color: "var(--gw-fg-muted)",
              }}>
                {block.day}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {block.sessions.map((s) => (
                  <div key={s.time} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{
                      fontWeight: 800, fontSize: 18, lineHeight: 1,
                      letterSpacing: "-.02em", flexShrink: 0, color: "var(--gw-fg)",
                    }}>
                      {s.time}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 600, lineHeight: 1.3,
                      color: "var(--gw-fg-muted)",
                    }}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rsd-card" style={{ gap: 12, padding: "22px 24px" }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: ".1em",
              textTransform: "uppercase", color: "var(--gw-fg-muted)",
            }}>
              Location
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <Icons.MapPin width={14} height={14} style={{ color: "var(--gw-fg-muted)", flexShrink: 0, marginTop: 3 }} />
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, color: "var(--gw-fg)" }}>
                {CHURCH_ADDRESS[0]}<br />{CHURCH_ADDRESS[1]}
              </span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "11px 24px", borderRadius: 100,
            background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
            fontSize: 13, fontWeight: 700,
          }}>
            Visit our website
            <Icons.ArrowRight width={13} height={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
