"use client";
import Link from "next/link";
import { Icons } from "./icons";

export function PublicFooter() {
  return (
    <footer style={{
      background: "var(--gw-ink)",
      color: "rgba(255,255,255,.7)",
      padding: "48px 24px 32px",
      marginTop: "auto",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 40,
          marginBottom: 48,
        }}>
          {/* Brand */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#fff", lineHeight: 1 }}>Millard Community</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,.45)", lineHeight: 1, marginTop: 2 }}>CHURCH</div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, maxWidth: 240 }}>
              A community of faith in Millard, Nebraska — worshipping, growing, and serving together.
            </p>
          </div>

          {/* Quick links */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginBottom: 4 }}>
              Navigate
            </div>
            {[
              { href: "/", label: "Home" },
              { href: "/beliefs", label: "Beliefs" },
              { href: "/messages", label: "Messages" },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.65)", transition: "color 150ms" }}
                onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => (e.currentTarget.style.color = "rgba(255,255,255,.65)")}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Contact */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginBottom: 4 }}>
              Contact
            </div>
            {[
              { icon: <Icons.MapPin width={13} height={13}/>, text: "9001 Q Street, Omaha, NE 68127" },
              { icon: <Icons.Mail width={13} height={13}/>, text: "info@millardcommunitychurch.com" },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
                <span style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>

          {/* Service times */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".09em", textTransform: "uppercase", color: "rgba(255,255,255,.35)", marginBottom: 4 }}>
              Service Times
            </div>
            {[
              { day: "Sunday 9:30 AM", time: "Bible Study & Children's Ministry" },
              { day: "Sunday 11:00 AM", time: "Congregational Singing & Preaching" },
              { day: "Wednesday 7:00 PM", time: "Bible Study & Children's Ministry" },
            ].map(s => (
              <div key={s.day} style={{ fontSize: 13, fontWeight: 500 }}>
                <div style={{ fontWeight: 700, color: "#fff" }}>{s.day}</div>
                <div style={{ color: "rgba(255,255,255,.55)" }}>{s.time}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          paddingTop: 24,
          borderTop: "1px solid rgba(255,255,255,.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
        }}>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>
            © {new Date().getFullYear()} Millard Community Church. All rights reserved.
          </span>
          <Link href="/portal" style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.35)", display: "flex", alignItems: "center", gap: 5 }}>
            <Icons.Shield width={12} height={12}/>
            Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
