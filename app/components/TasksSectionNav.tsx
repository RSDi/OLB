import Link from "next/link";

// Sub-nav for the "Tasks & Projects" section. Review + PM used to be their own
// sidebar items; they're now tabs here, shown only to staff. A plain member
// sees just their tasks with no tab-bar (the bar hides when only one tab is
// visible). Each page renders this at the top with its own `active` key.
const TABS: { key: string; href: string; label: string; staff: boolean }[] = [
  { key: "tasks", href: "/portal/tasks", label: "Tasks & Projects", staff: false },
  { key: "review", href: "/portal/review", label: "Review", staff: true },
  { key: "pm", href: "/portal/pm", label: "PM", staff: true },
];

export function TasksSectionNav({ active, isStaff }: { active: "tasks" | "review" | "pm"; isStaff: boolean }) {
  const visible = TABS.filter((t) => !t.staff || isStaff);
  if (visible.length <= 1) return null;
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
      {visible.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className="gw-press"
            style={{
              padding: "7px 14px",
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              background: on ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
              color: on ? "var(--rsd-accent-on)" : "var(--gw-fg)",
              border: `1px solid ${on ? "var(--rsd-accent)" : "var(--gw-border)"}`,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
