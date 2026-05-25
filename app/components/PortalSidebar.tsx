"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icons } from "./icons";
import { createClient } from "../../lib/supabase/client";
import { isStaff, isSuperAdmin, type MemberLike } from "../../lib/auth/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
  staffOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: "/portal", label: "Dashboard", icon: <Icons.LayoutDashboard width={16} height={16}/>, exact: true },
  { href: "/portal/maintenance", label: "Maintenance", icon: <Icons.Wrench width={16} height={16}/> },
  { href: "/portal/pm", label: "PM", icon: <Icons.Clock width={16} height={16}/>, staffOnly: true },
  { href: "/portal/events", label: "Events", icon: <Icons.Calendar width={16} height={16}/> },
  { href: "/portal/directory", label: "Directory", icon: <Icons.Users width={16} height={16}/> },
  { href: "/portal/docs", label: "Playbooks", icon: <Icons.BookOpen width={16} height={16}/> },
  { href: "/portal/settings", label: "Settings", icon: <Icons.Cog width={16} height={16}/>, staffOnly: true },
];

interface PortalSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

export function PortalSidebar({ collapsed, onToggleCollapse, mobileOpen, onNavigate }: PortalSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [member, setMember] = useState<MemberLike | null>(null);
  // Staff (admin + super_admin) see Settings; the pending-count badge stays
  // super-admin-only since admins can't action the member queue.
  const canSeeSettings = isStaff(member);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    // Determine the signed-in user's role. RLS lets every signed-in user
    // read their own row, so this works without elevated privileges.
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("members")
        .select("role, status")
        .eq("user_id", user.id)
        .maybeSingle();
      const memberLike = (me as MemberLike | null) ?? null;
      setMember(memberLike);

      // Pending count is only meaningful (and visible via RLS) to staff. In
      // Phase 1 only super-admins can act on it, so we gate it there.
      if (isSuperAdmin(memberLike)) {
        const { count } = await supabase
          .from("members")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");
        setPendingCount(count ?? 0);
      }
    })();
  }, []);

  const c = isMobile ? false : collapsed;

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className={`rsd-sidebar${mobileOpen ? " rsd-mob-open" : ""}`} style={{
      background: "var(--gw-ink)",
      borderRight: "1px solid var(--gw-stroke-dark)",
      padding: c ? "20px 8px" : "20px 14px",
      display: "flex", flexDirection: "column", gap: 14,
      color: "rgba(255,255,255,.7)",
      transition: "padding 200ms var(--gw-ease)",
    }}>
      {/* Brand */}
      <Link href="/" style={{
        display: "flex", gap: c ? 0 : 10, alignItems: "center",
        justifyContent: c ? "center" : "flex-start",
        padding: c ? "10px 0" : "10px 12px",
        border: "1px solid var(--gw-stroke-dark)",
        borderRadius: 12, background: "var(--gw-ink-2)",
        textDecoration: "none",
        flexShrink: 0,
      }}>
        {!c && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 11, color: "#fff", lineHeight: 1 }}>Millard Community</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.4)", lineHeight: 1, marginTop: 2, letterSpacing: ".04em" }}>MEMBER PORTAL</div>
          </div>
        )}
      </Link>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {NAV.filter(item => !item.staffOnly || canSeeSettings).map(item => {
          const active = isActive(item.href, item.exact);
          const isSettings = item.href === "/portal/settings";
          return (
            <Link
              key={item.href}
              href={item.href}
              className="gw-press"
              onClick={() => { if (isMobile) onNavigate?.(); }}
              style={{
                display: "flex",
                flexDirection: c ? "column" : "row",
                alignItems: "center",
                justifyContent: c ? "center" : "flex-start",
                gap: c ? 3 : (isMobile ? 14 : 10),
                padding: c ? "7px 2px" : (isMobile ? "14px 14px" : "8px 10px"),
                borderRadius: 9,
                background: active ? "var(--gw-ink-2)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,.65)",
                border: "1px solid",
                borderColor: active ? "var(--gw-stroke-dark)" : "transparent",
                fontWeight: 700, fontSize: isMobile ? 15 : 13, lineHeight: 1,
                textDecoration: "none",
                transition: "background 150ms",
                position: "relative",
                minHeight: isMobile ? 48 : undefined,
              }}
            >
              <span style={{ display: "flex", flexShrink: 0, color: active ? "var(--rsd-accent)" : "rgba(255,255,255,.5)", position: "relative", transform: isMobile ? "scale(1.15)" : undefined, transformOrigin: "center" }}>
                {item.icon}
                {isSettings && pendingCount > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -4,
                    width: 14, height: 14, borderRadius: "50%",
                    background: "var(--gw-error)", color: "#fff",
                    fontSize: 9, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    lineHeight: 1,
                  }}>
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </span>
              {c ? (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", opacity: 0.75 }}>
                  {item.label}
                </span>
              ) : (
                <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {item.label}
                  {isSettings && pendingCount > 0 && !c && (
                    <span style={{
                      background: "var(--gw-error)", color: "#fff",
                      fontSize: 10, fontWeight: 800, borderRadius: 100,
                      padding: "2px 6px", lineHeight: 1.4,
                    }}>
                      {pendingCount}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
        {!isMobile && (
          <button
            onClick={onToggleCollapse}
            className="gw-press"
            title={c ? "Expand sidebar" : "Collapse sidebar"}
            style={{
              display: "flex", alignItems: "center", justifyContent: c ? "center" : "flex-start",
              gap: 10, padding: "10px 12px", borderRadius: 10, width: "100%",
              background: "var(--gw-ink-3)", border: "1px solid var(--gw-stroke-dark)",
              color: "rgba(255,255,255,.75)", fontWeight: 700, fontSize: 13,
            }}
          >
            <span style={{ display: "flex", flexShrink: 0 }}>
              {c ? <Icons.ChevronsRight width={16} height={16}/> : <Icons.ChevronsLeft width={16} height={16}/>}
            </span>
            {!c && "Collapse"}
          </button>
        )}
        <button
          onClick={handleSignOut}
          style={{
            display: "flex", alignItems: "center", justifyContent: c ? "center" : "flex-start",
            gap: isMobile ? 14 : 10,
            padding: isMobile ? "14px 14px" : "10px 12px",
            borderRadius: 10, width: "100%",
            color: "rgba(255,255,255,.5)", fontWeight: 700,
            fontSize: isMobile ? 15 : 13,
            minHeight: isMobile ? 48 : undefined,
            background: "none", border: "none", cursor: "pointer", transition: "color 150ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--gw-error)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.5)")}
        >
          <span style={{ display: "flex", transform: isMobile ? "scale(1.15)" : undefined }}>
            <Icons.LogOut width={16} height={16}/>
          </span>
          {!c && "Sign out"}
        </button>
      </div>
    </aside>
  );
}
