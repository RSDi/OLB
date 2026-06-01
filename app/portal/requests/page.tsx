import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { Icons } from "../../components/icons";

interface RequestCard {
  href: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  accent: { bg: string; color: string };
}

const CARDS: RequestCard[] = [
  {
    href: "/portal/requests/building-use",
    title: "Building use",
    blurb: "Use a room, the gym, or the kitchen — for a gathering, party, wedding, class, or sports.",
    icon: <Icons.Home width={22} height={22} />,
    accent: { bg: "var(--rsd-accent-bg)", color: "var(--rsd-accent)" },
  },
  {
    href: "/portal/tasks/new?category=Maintenance",
    title: "Report a problem",
    blurb: "Something's broken or needs fixing — or we should buy a piece of equipment.",
    icon: <Icons.Wrench width={22} height={22} />,
    accent: { bg: "rgb(254,243,199)", color: "#92400e" },
  },
  {
    href: "/portal/tasks/new?category=General",
    title: "Ask the committee",
    blurb: "A question or a suggestion for the building committee.",
    icon: <Icons.Info width={22} height={22} />,
    accent: { bg: "rgb(239,246,255)", color: "#1d4ed8" },
  },
];

export default async function RequestsLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 640 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--gw-fg)" }}>What do you need?</h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
          Pick one below and we&rsquo;ll walk you through a few quick questions. The building committee
          reviews every request and follows up.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rsd-card gw-press"
            style={{ cursor: "pointer", gap: 14, textDecoration: "none", color: "var(--gw-fg)" }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: c.accent.bg,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: c.accent.color,
                }}
              >
                {c.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                  {c.title}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.65, fontWeight: 500 }}>
              {c.blurb}
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingTop: 4,
                borderTop: "1px solid var(--gw-border)",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "var(--rsd-accent)",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Start <Icons.ArrowRight width={12} height={12} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
