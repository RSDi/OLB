"use client";
import Link from "next/link";
import { Icons } from "../../components/icons";

export default function AssistancePage() {
  return (
    <>
      {/* Header */}
      <section style={{ padding: "72px 24px 56px", background: "var(--gw-bg)", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h1 style={{
            margin: "0 0 16px",
            fontSize: "clamp(30px, 5vw, 48px)",
            fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1,
          }}>
            How can we help?
          </h1>
          <p style={{
            margin: 0,
            fontSize: 17, lineHeight: 1.75,
            color: "var(--gw-fg-muted)", fontWeight: 500,
          }}>
            Submit a maintenance request or reserve the building for your event.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section style={{ padding: "0 24px 96px", background: "var(--gw-bg)" }}>
        <div style={{
          maxWidth: 840, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
        }}>
          {/* Maintenance card */}
          <Link href="/assistance/maintenance" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              borderRadius: 20,
              padding: "40px 36px",
              display: "flex", flexDirection: "column", gap: 20,
              cursor: "pointer",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--rsd-accent)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 3px var(--rsd-accent-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--gw-border)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "var(--rsd-accent-bg)",
                border: "1px solid rgba(108,140,89,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--rsd-accent)",
              }}>
                <Icons.Wrench width={22} height={22}/>
              </div>
              <div>
                <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", color: "var(--gw-fg)" }}>
                  Maintenance Requests
                </h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  Report a facility issue — a broken fixture, HVAC problem, lighting outage, or anything that needs attention.
                </p>
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 100,
                background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
                fontSize: 13, fontWeight: 700, alignSelf: "flex-start",
              }}>
                Submit a Request
                <Icons.ArrowRight width={13} height={13}/>
              </div>
            </div>
          </Link>

          {/* Building use card */}
          <Link href="/assistance/building" style={{ textDecoration: "none" }}>
            <div style={{
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              borderRadius: 20,
              padding: "40px 36px",
              display: "flex", flexDirection: "column", gap: 20,
              cursor: "pointer",
              transition: "border-color 150ms, box-shadow 150ms",
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--rsd-accent)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 3px var(--rsd-accent-bg)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--gw-border)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "var(--rsd-accent-bg)",
                border: "1px solid rgba(108,140,89,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--rsd-accent)",
              }}>
                <Icons.Calendar width={22} height={22}/>
              </div>
              <div>
                <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, letterSpacing: "-.01em", color: "var(--gw-fg)" }}>
                  Building Use Requests
                </h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  Reserve the building for a wedding, party, basketball, volleyball, or another private event.
                </p>
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "10px 20px", borderRadius: 100,
                background: "var(--rsd-accent)", color: "var(--rsd-accent-on)",
                fontSize: 13, fontWeight: 700, alignSelf: "flex-start",
              }}>
                Reserve the Building
                <Icons.ArrowRight width={13} height={13}/>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </>
  );
}
