import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../lib/auth/permissions";

type StatusFilter = "all" | "pending" | "in_progress" | "done" | "skipped";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "skipped", label: "Skipped" },
];

interface InstanceRow {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  scheduled_for: string;
  step_checks: { checked: boolean }[];
  area: { name: string } | null;
  priority: { label: string; chip_class: string } | null;
}

export default async function PmInstancesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status: StatusFilter = isValidStatus(params.status) ? params.status : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal");

  let query = supabase
    .from("pm_instances")
    .select(
      `id, title, status, scheduled_for, step_checks,
       area:areas(name),
       priority:priorities(label, chip_class)`
    )
    .is("deleted_at", null)
    .order("scheduled_for", { ascending: true });

  if (status !== "all") query = query.eq("status", status);

  const { data: rows } = await query;
  const instances = (rows as unknown as InstanceRow[]) ?? [];

  const { data: allRows } = await supabase
    .from("pm_instances")
    .select("status")
    .is("deleted_at", null);
  const counts = countByStatus((allRows as { status: InstanceRow["status"] }[]) ?? []);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/portal/pm/calendar"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 100,
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icons.Calendar width={14} height={14} />
            Calendar
          </Link>
          <Link
            href="/portal/pm/templates"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 100,
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icons.Cog width={14} height={14} />
            Manage templates
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Pending" value={counts.pending} chip="rsd-chip-warn" />
        <StatCard label="In Progress" value={counts.in_progress} chip="rsd-chip-accent" />
        <StatCard label="Done" value={counts.done} chip="rsd-chip-success" />
        <StatCard label="Skipped" value={counts.skipped} chip="rsd-chip-mute" />
      </div>

      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_TABS.map((t) => {
          const href = t.key === "all" ? "/portal/pm" : `/portal/pm?status=${t.key}`;
          const active = status === t.key;
          return (
            <Link
              key={t.key}
              href={href}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: active ? "var(--gw-bg-elev)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--gw-border)" : "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {instances.length} {instances.length === 1 ? "task" : "tasks"}
          </h3>
        </div>
        {instances.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              {status === "all" ? "No PM tasks yet" : `No ${labelFor(status).toLowerCase()} tasks`}
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              {counts.pending + counts.in_progress + counts.done + counts.skipped === 0
                ? "Create a template, then click 'Generate instance' to spin off a task."
                : "Switch filters above or generate another instance from a template."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {instances.map((inst) => {
              const total = inst.step_checks.length;
              const done = inst.step_checks.filter((s) => s.checked).length;
              return (
                <Link
                  key={inst.id}
                  href={`/portal/pm/${inst.id}`}
                  style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--gw-border)",
                    textDecoration: "none",
                    color: "inherit",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
                        {inst.title}
                      </span>
                      {statusChip(inst.status)}
                      {inst.priority && (
                        <span className={`rsd-chip ${inst.priority.chip_class}`}>
                          {inst.priority.label}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gw-fg-muted)",
                        fontWeight: 500,
                        marginTop: 4,
                      }}
                    >
                      {inst.area?.name ?? "Unknown area"} · Scheduled {formatDate(inst.scheduled_for)}{" "}
                      {total > 0 && `· ${done}/${total} steps`}
                    </div>
                  </div>
                  <Icons.ChevronRight width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function StatCard({ label, value, chip }: { label: string; value: number; chip: string }) {
  return (
    <div
      className="rsd-card"
      style={{ padding: "14px 20px", gap: 6, flexDirection: "row", alignItems: "center" }}
    >
      <span style={{ fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", letterSpacing: "-.02em" }}>
        {value}
      </span>
      <span className={`rsd-chip ${chip}`}>{label}</span>
    </div>
  );
}

function statusChip(s: InstanceRow["status"]) {
  if (s === "pending") return <span className="rsd-chip rsd-chip-warn">Pending</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "skipped") return <span className="rsd-chip rsd-chip-mute">Skipped</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function isValidStatus(s: string | undefined): s is StatusFilter {
  return s === "pending" || s === "in_progress" || s === "done" || s === "skipped" || s === "all";
}

function labelFor(s: StatusFilter): string {
  return STATUS_TABS.find((t) => t.key === s)?.label ?? "";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function countByStatus(rows: { status: InstanceRow["status"] }[]) {
  const out = { pending: 0, in_progress: 0, done: 0, skipped: 0 };
  for (const r of rows) {
    out[r.status] = (out[r.status] ?? 0) + 1;
  }
  return out;
}
