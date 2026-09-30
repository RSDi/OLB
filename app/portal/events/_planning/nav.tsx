import Link from "next/link";
import type { PlanningRole } from "../../../../lib/planning/types";

export type PlanningView = "upcoming" | "past" | "all" | "year" | "review" | "template";

const CALENDAR_VIEWS: PlanningView[] = ["upcoming", "past", "all"];
const PLANNER_VIEWS: PlanningView[] = ["year", "review", "template"];

export function parseView(s: string | undefined, planner: boolean): PlanningView {
  if (CALENDAR_VIEWS.includes(s as PlanningView)) return s as PlanningView;
  if (planner && PLANNER_VIEWS.includes(s as PlanningView)) return s as PlanningView;
  return "upcoming";
}

// A link within Planning, keeping only the params that view uses.
export function planningHref(p: {
  view?: PlanningView;
  season?: number | null;
  role?: string | null;
  show?: string | null;
  hash?: string;
}): string {
  const q = new URLSearchParams();
  if (p.view && p.view !== "upcoming") q.set("view", p.view);
  if (p.season != null) q.set("season", String(p.season));
  if (p.role) q.set("role", p.role);
  if (p.show) q.set("show", p.show);
  const s = q.toString();
  return `/portal/events${s ? `?${s}` : ""}${p.hash ? `#${p.hash}` : ""}`;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: 8,
  background: active ? "var(--gw-bg-elev)" : "transparent",
  border: "1px solid",
  borderColor: active ? "var(--gw-border)" : "transparent",
  fontSize: 13,
  fontWeight: 700,
  color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
});

export function PlanningTabs({
  view,
  planner,
  role,
  pendingCount,
}: {
  view: PlanningView;
  planner: boolean;
  role: string | null;
  pendingCount: number;
}) {
  const tabs: { key: PlanningView; label: string }[] = [
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
    { key: "all", label: "All" },
    ...(planner
      ? ([
          { key: "year", label: "Year" },
          { key: "review", label: "Review" },
          { key: "template", label: "Template" },
        ] as const)
      : []),
  ];
  return (
    <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={planningHref({ view: t.key, role: t.key === "template" ? null : role })}
          style={tabStyle(view === t.key)}
          aria-current={view === t.key ? "page" : undefined}
        >
          {t.label}
          {t.key === "review" && pendingCount > 0 && (
            <span
              style={{
                background: "var(--rsd-error-fill)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 800,
                borderRadius: 100,
                padding: "2px 6px",
                lineHeight: 1.3,
              }}
            >
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// "Everyone · President · Athletic Director · …": show one role's tasks.
export function RoleFilter({
  roles,
  active,
  hrefFor,
}: {
  roles: PlanningRole[];
  active: string | null;
  hrefFor: (roleId: string | null) => string;
}) {
  if (roles.length === 0) return null;
  const pill = (on: boolean): React.CSSProperties => ({
    padding: "5px 12px",
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
    border: "1px solid",
    borderColor: on ? "var(--rsd-accent)" : "var(--gw-border)",
    background: on ? "var(--rsd-accent-fill)" : "transparent",
    color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
  });
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} aria-label="Show tasks for">
      <Link href={hrefFor(null)} style={pill(active === null)}>
        Everyone
      </Link>
      {roles.map((r) => (
        <Link key={r.id} href={hrefFor(r.id)} style={pill(active === r.id)}>
          {r.name}
        </Link>
      ))}
    </div>
  );
}

// Shown to the planner when migration 0104 isn't in the database yet.
export function MigrationNotice() {
  return (
    <div
      className="rsd-card"
      style={{ padding: "16px 20px", gap: 6, borderColor: "var(--rsd-warn-line)", background: "var(--rsd-warn-bg)" }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>Planning isn&apos;t set up in the database yet</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
        Apply <code>supabase/migrations/0104_planning.sql</code> in the Supabase SQL editor. It adds the
        yearly template (already filled in from the President and AD timeline), the roles and the board
        meetings. Events keep working in the meantime.
      </div>
    </div>
  );
}
