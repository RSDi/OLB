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
    title: "Reserve a room or space",
    blurb: "A room, the kitchen, the gym, or the whole building — for a gathering, sports, party, wedding, or class.",
    icon: <Icons.Home width={22} height={22} />,
    accent: { bg: "var(--rsd-accent-bg)", color: "var(--rsd-accent)" },
  },
  {
    href: "/portal/requests/maintenance",
    title: "Report a problem",
    blurb: "Something's broken or needs fixing — or we should buy a piece of equipment.",
    icon: <Icons.Wrench width={22} height={22} />,
    accent: { bg: "rgb(254,243,199)", color: "#92400e" },
  },
  {
    href: "/portal/requests/question",
    title: "Ask the committee",
    blurb: "A question or a suggestion for the building committee.",
    icon: <Icons.Info width={22} height={22} />,
    accent: { bg: "var(--gw-success-bg)", color: "#16a34a" },
  },
];

export default async function RequestsLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The member's own recent requests (wizard submissions have details), so they
  // can track status — including declined ones, which the work queue hides.
  const { data: mine } = await supabase
    .from("maintenance_requests")
    .select("id, description, review_status, created_at")
    .eq("submitted_by", user.id)
    .not("details", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(8);
  const recent = (mine ?? []) as { id: string; description: string; review_status: string; created_at: string }[];

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

      {recent.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
          <h3 style={{ margin: "8px 0 0", fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>Your recent requests</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/portal/tasks/${r.id}`}
                className="rsd-card gw-press"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  textDecoration: "none",
                  color: "var(--gw-fg)",
                  padding: "12px 16px",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--gw-fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {firstLine(r.description)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{formatDate(r.created_at)}</div>
                </div>
                {statusChip(r.review_status)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function statusChip(s: string) {
  if (s === "pending_review") return <span className="rsd-chip rsd-chip-warn">Pending review</span>;
  if (s === "declined") return <span className="rsd-chip rsd-chip-error">Declined</span>;
  return <span className="rsd-chip rsd-chip-success">Approved</span>;
}

function firstLine(s: string): string {
  return s.split("\n")[0];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
