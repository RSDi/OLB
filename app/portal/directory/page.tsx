import Link from "next/link";
import { Icons } from "../../components/icons";
import { AccessDenied } from "./_shared/AccessDenied";
import { loadViewer } from "./_shared/data";

interface ViewCard {
  href: string;
  title: string;
  blurb: string;
  icon: React.ReactNode;
  accent: { bg: string; color: string };
  superAdminOnly?: boolean;
}

const VIEWS: ViewCard[] = [
  {
    href: "/portal/directory/households",
    title: "Households",
    blurb: "Families grouped by household. Couples, kids, addresses, contact info.",
    icon: <Icons.Home width={20} height={20} />,
    accent: { bg: "var(--rsd-accent-bg)", color: "var(--rsd-accent)" },
  },
  {
    href: "/portal/directory/all",
    title: "All members",
    blurb: "Flat A–Z list with search and filters by volunteer team, status, and more.",
    icon: <Icons.Users width={20} height={20} />,
    accent: { bg: "rgb(239,246,255)", color: "#1d4ed8" },
  },
  {
    href: "/portal/directory/birthdays",
    title: "Birthdays",
    blurb: "Sorted Jan–Dec. Milestone chips ('Sweet 16', '21st', '50th') and Wiffleball eligibility.",
    icon: <Icons.Calendar width={20} height={20} />,
    accent: { bg: "rgb(254,243,199)", color: "#92400e" },
  },
  {
    href: "/portal/directory/anniversaries",
    title: "Anniversaries",
    blurb: "Couples by month, with decade markers ('25 years', '50+').",
    icon: <Icons.Heart width={20} height={20} />,
    accent: { bg: "rgb(243,232,255)", color: "#6d28d9" },
  },
  {
    href: "/portal/directory/phones",
    title: "Phone tree",
    blurb: "Compact list of cell + home phones, grouped by household. Print-friendly.",
    icon: <Icons.Phone width={20} height={20} />,
    accent: { bg: "var(--gw-success-bg)", color: "#16a34a" },
  },
  {
    href: "/portal/directory/extended",
    title: "Extended family",
    blurb: "Adult children, grandchildren, and family of MCC members who don't regularly attend.",
    icon: <Icons.Users width={20} height={20} />,
    accent: { bg: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" },
  },
  {
    href: "/portal/directory/memorials",
    title: "Asleep in Jesus",
    blurb: "Memorial list — members and family of members who've gone before us.",
    icon: <Icons.Shield width={20} height={20} />,
    accent: { bg: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" },
  },
];

export default async function DirectoryLandingPage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {VIEWS.filter((v) => !v.superAdminOnly || viewer.isSuperAdmin).map((v) => (
          <Link
            key={v.href}
            href={v.href}
            className="rsd-card gw-press"
            style={{
              cursor: "pointer",
              gap: 14,
              textDecoration: "none",
              color: "var(--gw-fg)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: v.accent.bg,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: v.accent.color,
                }}
              >
                {v.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gw-fg)", lineHeight: 1.3 }}>
                  {v.title}
                </div>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.65, fontWeight: 500 }}>
              {v.blurb}
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
                Open <Icons.ArrowRight width={12} height={12} />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
