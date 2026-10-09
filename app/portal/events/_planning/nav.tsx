import Link from "next/link";
import type { PlanningRole } from "../../../../lib/planning/types";
import { LinkSelect } from "./LinkSelect";

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
  padding: "8px 14px",
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

// The board's tabs: Calendar (Upcoming, Past or All, picked under it), Year,
// Review and Template. Everyone else only has the calendar, so no tabs.
export function PlanningTabs({
  view,
  role,
  pendingCount,
}: {
  view: PlanningView;
  role: string | null;
  pendingCount: number;
}) {
  // `tour`: the tab's guided-tour anchor (lib/help/tours.ts).
  const tabs: { key: PlanningView; label: string; tour: string }[] = [
    { key: "upcoming", label: "Calendar", tour: "planning-tab-calendar" },
    { key: "year", label: "Year", tour: "planning-tab-year" },
    { key: "review", label: "Review", tour: "planning-tab-review" },
    { key: "template", label: "Template", tour: "planning-tab-template" },
  ];
  const isOn = (k: PlanningView) => (k === "upcoming" ? CALENDAR_VIEWS.includes(view) : view === k);
  return (
    <div data-tour="planning-tabs" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      {tabs.map((t) => (
        <Link
          key={t.key}
          data-tour={t.tour}
          // The calendar tab keeps Past or All when you're already on it.
          href={planningHref({ view: t.key === "upcoming" && isOn("upcoming") ? view : t.key, role: t.key === "template" ? null : role })}
          style={tabStyle(isOn(t.key))}
          aria-current={isOn(t.key) ? "page" : undefined}
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

// A row of chip drop-downs above a view.
export function FilterRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;
}

// "All roles", "President", …: show one role's tasks.
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
  return (
    <LinkSelect
      label="Show tasks for"
      data-tour="planning-roles"
      value={active ?? ""}
      active={active !== null}
      options={[
        { value: "", label: "All roles", href: hrefFor(null) },
        ...roles.map((r) => ({ value: r.id, label: r.name, href: hrefFor(r.id) })),
      ]}
    />
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
        Apply <code>supabase/migrations/0104_planning.sql</code> and then{" "}
        <code>0105_planning_meeting_history.sql</code> in the Supabase SQL editor. They add the yearly template
        (already filled in from the President and AD timeline), the roles, the board meetings and their history.
        Events keep working in the meantime.
      </div>
    </div>
  );
}
