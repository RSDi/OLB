import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { QueueRow } from "./QueueRow";

type StatusFilter = "all" | "open" | "in_progress" | "done" | "cancelled";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

interface TicketRow {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  created_at: string;
  submitted_by: string | null;
  assigned_to: string | null;
  category: { name: string; chip_class: string } | null;
  area: { name: string } | null;
  priority: { id: string; label: string; chip_class: string; severity: number } | null;
}

interface PriorityOption {
  id: string;
  label: string;
  chip_class: string;
}

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
}

export default async function PortalMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>;
}) {
  const params = await searchParams;
  const status: StatusFilter = isValidStatus(params.status) ? params.status : "all";
  const categoryFilter = params.category ?? null;

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
  const me = (meRow as MemberLike | null) ?? null;
  const staff = isStaff(me);
  const superAdmin = isSuperAdmin(me);

  // RLS already filters: staff sees all non-deleted; members see own only.
  let query = supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, created_at, submitted_by, assigned_to,
       category:task_categories(name, chip_class),
       area:areas(name),
       priority:priorities(id, label, chip_class, severity)`
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (status !== "all") {
    query = query.eq("status", status);
  }
  if (categoryFilter) {
    query = query.eq("category_id", categoryFilter);
  }

  const { data: ticketsRaw } = await query;
  const tickets = (ticketsRaw as unknown as TicketRow[]) ?? [];

  // Resolve submitter names. RLS lets staff see all members and lets a member
  // see their own row, so this just works without elevated privileges.
  const submitterIds = Array.from(
    new Set(tickets.map((t) => t.submitted_by).filter((v): v is string => Boolean(v)))
  );
  const submitterMap: Record<string, { full_name: string | null; email: string }> = {};
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabase
      .from("members")
      .select("user_id, full_name, email")
      .in("user_id", submitterIds);
    for (const s of submitters ?? []) {
      submitterMap[s.user_id] = { full_name: s.full_name, email: s.email };
    }
  }

  // Counts for stat chips (independent of the current status filter).
  const { data: allForCounts } = await supabase
    .from("maintenance_requests")
    .select("status, priority:priorities(severity)")
    .is("deleted_at", null);
  const counts = countByStatus(
    (allForCounts as unknown as { status: TicketRow["status"]; priority: { severity: number } | null }[]) ?? []
  );

  // Lookups for the inline row selects. Members never see the staff list (no
  // assignment dropdown) so we skip that fetch for them.
  const { data: prioritiesRaw } = await supabase
    .from("priorities")
    .select("id, label, chip_class")
    .is("deleted_at", null)
    .order("severity", { ascending: true });
  const priorities = (prioritiesRaw as PriorityOption[]) ?? [];

  const { data: categoriesRaw } = await supabase
    .from("task_categories")
    .select("id, name, chip_class")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const categories = (categoriesRaw as { id: string; name: string; chip_class: string }[]) ?? [];

  // Build a queue URL preserving both the status and category filters.
  const tasksHref = (s: string, c: string | null) => {
    const p = new URLSearchParams();
    if (s && s !== "all") p.set("status", s);
    if (c) p.set("category", c);
    const q = p.toString();
    return q ? `/portal/tasks?${q}` : "/portal/tasks";
  };
  const filterChipStyle = (active: boolean) => ({
    padding: "5px 12px",
    borderRadius: 100,
    fontSize: 12,
    fontWeight: 700,
    textDecoration: "none",
    border: "1px solid var(--gw-border)",
    background: active ? "var(--rsd-accent)" : "var(--gw-bg-elev)",
    color: active ? "var(--rsd-accent-on)" : "var(--gw-fg-muted)",
  });

  let staffList: StaffMember[] = [];
  if (staff) {
    const { data: staffRows } = await supabase
      .from("members")
      .select("id, full_name, email")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved")
      .order("full_name", { ascending: true });
    staffList = staffRows ?? [];
  }

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/portal/tasks/projects"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.LayoutDashboard width={14} height={14} />
          Projects
        </Link>
        <Link
          href="/portal/tasks/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 100,
            background: "var(--rsd-accent)",
            color: "var(--rsd-accent-on)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.Plus width={14} height={14} />
          New task
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard label="Open" value={counts.open} chip="rsd-chip-warn" />
        <StatCard label="In Progress" value={counts.in_progress} chip="rsd-chip-accent" />
        <StatCard label="Done" value={counts.done} chip="rsd-chip-success" />
        <StatCard label="High Priority" value={counts.high_priority} chip="rsd-chip-error" />
      </div>

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_TABS.map((t) => {
          const href = tasksHref(t.key, categoryFilter);
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
        {superAdmin && (
          <>
            <span style={{ width: 1, height: 18, background: "var(--gw-border)", margin: "0 6px" }} />
            <Link
              href="/portal/tasks/deleted"
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: "transparent",
                border: "1px solid transparent",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--gw-fg-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icons.Trash width={12} height={12} />
              Deleted
            </Link>
          </>
        )}
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", marginRight: 2 }}>
            Category
          </span>
          <Link href={tasksHref(status, null)} style={filterChipStyle(!categoryFilter)}>
            All
          </Link>
          {categories.map((c) => (
            <Link key={c.id} href={tasksHref(status, c.id)} style={filterChipStyle(categoryFilter === c.id)}>
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {tickets.length} {tickets.length === 1 ? "request" : "requests"}
          </h3>
        </div>
        {tickets.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              {status === "all" ? "No requests yet" : `No ${labelFor(status).toLowerCase()} requests`}
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              {staff ? "Submitted requests will appear here." : "Submit one with + New request above."}
            </div>
          </div>
        ) : (
          <table className="rsd-tbl">
            <thead>
              <tr>
                <th>Description</th>
                <th>Category</th>
                <th>Area</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Submitted</th>
                {staff && <th>By</th>}
                {staff && <th>Assigned</th>}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <QueueRow
                  key={t.id}
                  ticket={t}
                  submitter={t.submitted_by ? submitterMap[t.submitted_by] ?? null : null}
                  staff={staff}
                  priorities={priorities}
                  staffList={staffList}
                />
              ))}
            </tbody>
          </table>
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

function isValidStatus(s: string | undefined): s is StatusFilter {
  return s === "open" || s === "in_progress" || s === "done" || s === "cancelled" || s === "all";
}

function labelFor(s: StatusFilter): string {
  return STATUS_TABS.find((t) => t.key === s)?.label ?? "";
}

function countByStatus(
  rows: { status: TicketRow["status"]; priority: { severity: number } | null }[]
) {
  const out = { open: 0, in_progress: 0, done: 0, cancelled: 0, high_priority: 0 };
  for (const r of rows) {
    out[r.status] = (out[r.status] ?? 0) + 1;
    if ((r.priority?.severity ?? 0) >= 30 && (r.status === "open" || r.status === "in_progress")) {
      out.high_priority += 1;
    }
  }
  return out;
}
