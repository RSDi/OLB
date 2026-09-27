"use client";
// Settings → Integrations. ReelNotes lives here now (it used to be a top-level
// sidebar item). Board + Super Admin can open it; the page itself
// re-checks access (loadReelNotesViewer redirects non-staff).
import Link from "next/link";
import { Icons } from "../../components/icons";

interface Integration {
  key: string;
  name: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const INTEGRATIONS: Integration[] = [
  {
    key: "reelnotes",
    name: "ReelNotes",
    description:
      "Record a note by voice — it's transcribed and turned into action items. Available on task comments; your recordings collect here.",
    href: "/portal/reelnotes",
    icon: <Icons.Mic width={20} height={20} style={{ color: "var(--rsd-accent)" }} />,
  },
];

export function IntegrationsTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
      {INTEGRATIONS.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          className="rsd-card gw-press"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: 16,
            textDecoration: "none",
            color: "var(--gw-fg)",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
            }}
          >
            {it.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{it.name}</div>
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.5, marginTop: 2 }}>
              {it.description}
            </div>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--rsd-accent)", flexShrink: 0 }}>Open →</span>
        </Link>
      ))}
    </div>
  );
}
