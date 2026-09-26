import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { TasksSectionNav } from "../../components/TasksSectionNav";
import { createClient } from "../../../lib/supabase/server";
import { getAuthUser } from "../../../lib/auth/viewer";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { QueueRow, TaskScheduleChips } from "./QueueRow";
import { KanbanBoard, type KanbanCard } from "./KanbanBoard";
import { CategoryFilter } from "./CategoryFilter";
import { memberDisplayName } from "../../../lib/members/display";
import { churchToday, isOverdue } from "../../../lib/dates/today";

// "Things"-style views: the queue defaults to Active work and tucks away
// scheduled-for-later (Upcoming), parked (Someday), and finished (Done) tasks.
type Bucket = "active" | "upcoming" | "someday" | "done";
const BUCKET_TABS: { key: Bucket; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "upcoming", label: "Upcoming" },
  { key: "someday", label: "Someday" },
  { key: "done", label: "Done" },
];

interface TicketRow {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  review_status: "pending_review" | "approved" | "declined";
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  assigned_to: string | null;
  start_on: string | null;
  due_on: string | null;
  someday: boolean;
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
  nickname: string | null;
  email: string;
}

// Which view a task belongs in, from its status + schedule. Someday wins over a
// stray start date; done/cancelled always land in Done.
function bucketOf(
  t: { status: string; someday: boolean; start_on: string | null },
  today: string,
): Bucket {
  if (t.status === "done" || t.status === "cancelled") return "done";
  if (t.someday) return "someday";
  if (t.start_on && t.start_on > today) return "upcoming";
  return "active";
}

function sortForBucket(rows: TicketRow[], bucket: Bucket, today: string): TicketRow[] {
  const r = [...rows];
  if (bucket === "active") {
    // Overdue first, then soonest deadline, then priority, then newest.
    r.sort((a, b) => {
      const ao = isOverdue(a.due_on, today) ? 0 : 1;
      const bo = isOverdue(b.due_on, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if ((a.due_on ?? "") !== (b.due_on ?? "")) {
        if (!a.due_on) return 1;
        if (!b.due_on) return -1;
        return a.due_on < b.due_on ? -1 : 1;
      }
      const as = a.priority?.severity ?? 0;
      const bs = b.priority?.severity ?? 0;
      if (as !== bs) return bs - as;
      return a.created_at < b.created_at ? 1 : -1;
    });
  } else if (bucket === "upcoming") {
    r.sort((a, b) => ((a.start_on ?? "") < (b.start_on ?? "") ? -1 : (a.start_on ?? "") > (b.start_on ?? "") ? 1 : 0));
  } else if (bucket === "done") {
    r.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  } else {
    r.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  }
  return r;
}

export default async function PortalMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; category?: string; view?: string; layout?: string }>;
}) {
  const params = await searchParams;
  const bucket: Bucket = isValidBucket(params.bucket) ? params.bucket : "active";
  const categoryFilter = params.category ?? null;
  // "projects" view = only tasks that have sub-tasks (i.e. behave like projects).
  const view: "all" | "projects" = params.view === "projects" ? "projects" : "all";
  // Board (Kanban by status) is the default; List is the opt-in alternative.
  const layout: "board" | "list" = params.layout === "list" ? "list" : "board";
  const today = churchToday();

  const supabase = await createClient();
  const user = await getAuthUser();
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
  // We fetch every top-level task and bucket/sort in JS (so "today" uses the
  // church timezone, not the server's UTC day).
  let query = supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, review_status, reviewed_at, created_at, updated_at, submitted_by, assigned_to, start_on, due_on, someday,
       category:task_categories(name, chip_class),
       area:areas(name),
       priority:priorities(id, label, chip_class, severity)`
    )
    .is("deleted_at", null)
    // Top-level only: sub-tasks live on their parent's detail page, not the queue.
    .is("parent_id", null)
    .order("created_at", { ascending: false });

  // Keep requests still awaiting committee review out of the operational queue.
  // Staff see approved work only. A member sees all their own rows (RLS limits
  // them to their own) — including declined ones, so the committee's decision
  // shows in their list instead of the request silently vanishing.
  if (staff) {
    query = query.eq("review_status", "approved");
  }
  if (categoryFilter) {
    query = query.eq("category_id", categoryFilter);
  }

  const { data: ticketsRaw } = await query;
  const allTopLevel = (ticketsRaw as unknown as TicketRow[]) ?? [];

  // To-do progress per parent — drives the "To-dos · 3/7" chip and the
  // Projects view. RLS scopes this to rows the viewer is allowed to see.
  const { data: childRows } = await supabase
    .from("maintenance_requests")
    .select("parent_id, status")
    .not("parent_id", "is", null)
    .is("deleted_at", null);
  const progressByParent = new Map<string, { done: number; total: number }>();
  for (const r of (childRows as { parent_id: string; status: string }[] | null) ?? []) {
    const cur = progressByParent.get(r.parent_id) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (r.status === "done") cur.done += 1;
    progressByParent.set(r.parent_id, cur);
  }

  // Bucket + (optionally) Projects-filter + sort the visible tasks.
  const inBucket = allTopLevel.filter((t) => bucketOf(t, today) === bucket);
  const projectFiltered = view === "projects" ? inBucket.filter((t) => progressByParent.has(t.id)) : inBucket;
  const tickets = sortForBucket(projectFiltered, bucket, today);

  // Resolve submitter names. RLS lets staff see all members and lets a member
  // see their own row, so this just works without elevated privileges.
  const submitterIds = Array.from(
    new Set(tickets.map((t) => t.submitted_by).filter((v): v is string => Boolean(v)))
  );
  const submitterMap: Record<string, { full_name: string | null; nickname: string | null; email: string }> = {};
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", submitterIds);
    for (const s of submitters ?? []) {
      submitterMap[s.user_id] = { full_name: s.full_name, nickname: s.nickname, email: s.email };
    }
  }

  // Bucket counts for the tabs + stat cards (independent of the active tab and
  // the category filter). Same visibility as the main query.
  let countsQuery = supabase
    .from("maintenance_requests")
    .select("status, start_on, due_on, someday")
    .is("deleted_at", null)
    .is("parent_id", null);
  if (staff) countsQuery = countsQuery.eq("review_status", "approved");
  const { data: countRowsRaw } = await countsQuery;
  const counts = { active: 0, upcoming: 0, someday: 0, done: 0, overdue: 0 };
  for (const r of (countRowsRaw as { status: string; start_on: string | null; due_on: string | null; someday: boolean }[] | null) ?? []) {
    const b = bucketOf(r, today);
    counts[b] += 1;
    if (b === "active" && isOverdue(r.due_on, today)) counts.overdue += 1;
  }

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

  // Build a queue URL preserving layout, the active bucket, category, and the
  // Projects view. Board is the default layout, so `layout` is only set for List
  // (and the scheduling bucket only matters in List).
  const tasksHref = (b: Bucket, c: string | null, v: "all" | "projects" = view, l: "board" | "list" = layout) => {
    const p = new URLSearchParams();
    if (l === "list") {
      p.set("layout", "list");
      if (b && b !== "active") p.set("bucket", b);
    }
    if (c) p.set("category", c);
    if (v === "projects") p.set("view", "projects");
    const q = p.toString();
    return q ? `/portal/tasks?${q}` : "/portal/tasks";
  };
  // Category filter options for the dropdown (each carries its full href so the
  // <select> just navigates). Replaces the old row of category chips.
  const categoryOptions = [
    { value: "", label: "All", href: tasksHref(bucket, null) },
    ...categories.map((c) => ({ value: c.id, label: c.name, href: tasksHref(bucket, c.id) })),
  ];

  let staffList: StaffMember[] = [];
  if (staff) {
    const { data: staffRows } = await supabase
      .from("members")
      .select("id, full_name, nickname, email")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved")
      .order("full_name", { ascending: true });
    staffList = staffRows ?? [];
  }

  const bucketLabel = BUCKET_TABS.find((t) => t.key === bucket)?.label ?? "Active";
  const empty = emptyCopy(bucket, view, staff);

  // Board cards: top-level tasks by status (Open / In Progress / Done), minus
  // Someday-parked and Cancelled (those live in the List view). Category +
  // Projects filters apply. Sorted overdue-first so urgent cards rise.
  const assigneeNameById = new Map(staffList.map((s) => [s.id, memberDisplayName(s)] as const));
  const boardCards: KanbanCard[] = allTopLevel
    .filter((t) => !t.someday && t.status !== "cancelled")
    .filter((t) => (view === "projects" ? progressByParent.has(t.id) : true))
    .sort((a, b) => {
      const ao = isOverdue(a.due_on, today) ? 0 : 1;
      const bo = isOverdue(b.due_on, today) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if ((a.due_on ?? "") !== (b.due_on ?? "")) {
        if (!a.due_on) return 1;
        if (!b.due_on) return -1;
        return a.due_on < b.due_on ? -1 : 1;
      }
      return (b.priority?.severity ?? 0) - (a.priority?.severity ?? 0);
    })
    .map((t) => ({
      id: t.id,
      title: t.description.split("\n")[0],
      status: t.status,
      category: t.category,
      priority: t.priority ? { label: t.priority.label, chip_class: t.priority.chip_class } : null,
      assigneeName: t.assigned_to ? assigneeNameById.get(t.assigned_to) ?? null : null,
      start_on: t.start_on,
      due_on: t.due_on,
      someday: t.someday,
      progress: progressByParent.get(t.id) ?? null,
    }));

  return (
    <>
      <TasksSectionNav active="tasks" isStaff={staff} />
      {/* Header toolbar — view controls grouped on the left, the one primary
          action on the right. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Board ⇄ List layout toggle (unselected is quiet/transparent) */}
          <div style={{ display: "inline-flex", border: "1px solid var(--gw-border)", borderRadius: 100, overflow: "hidden" }}>
            {(["board", "list"] as const).map((l) => {
              const on = layout === l;
              return (
                <Link
                  key={l}
                  href={tasksHref(bucket, categoryFilter, view, l)}
                  style={{
                    padding: "9px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                    background: on ? "var(--rsd-accent)" : "transparent",
                    color: on ? "var(--rsd-accent-on)" : "var(--gw-fg-muted)",
                  }}
                >
                  {l === "board" ? "Board" : "List"}
                </Link>
              );
            })}
          </div>
          {categories.length > 0 && (
            <CategoryFilter value={categoryFilter ?? ""} options={categoryOptions} />
          )}
        </div>
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

      {/* At-a-glance counts — one quiet line instead of four boxes. Overdue only
          shows up (as a red chip that earns attention) when there's one. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
        <span>{counts.active} active</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{counts.upcoming} upcoming</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{counts.someday} someday</span>
        {counts.overdue > 0 && (
          <span className="rsd-chip rsd-chip-error" style={{ marginLeft: 4 }}>
            {counts.overdue} overdue
          </span>
        )}
      </div>

      {/* Scheduling-bucket tabs (List layout only) + the Deleted link. In Board
          layout, status is the columns, so the buckets don't apply. */}
      {(layout === "list" || superAdmin) && (
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
          {layout === "list" &&
            BUCKET_TABS.map((t) => {
              const href = tasksHref(t.key, categoryFilter);
              const active = bucket === t.key;
              const n = counts[t.key];
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
                  {n > 0 && <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}> {n}</span>}
                </Link>
              );
            })}
          {superAdmin && (
            <>
              {layout === "list" && <span style={{ width: 1, height: 18, background: "var(--gw-border)", margin: "0 6px" }} />}
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
      )}

      {/* Body: Board (Kanban by status) or List (table / mobile cards) */}
      {layout === "board" ? (
        boardCards.length === 0 ? (
          <div className="rsd-card" style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              Nothing on the board
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              {staff ? "Open tasks show up here by status." : "Submit one with + New task above."}
            </div>
          </div>
        ) : (
          <KanbanBoard cards={boardCards} today={today} canMove={staff} />
        )
      ) : (
      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {view === "projects"
              ? `${tickets.length} ${tickets.length === 1 ? "item" : "items"} with to-dos`
              : `${tickets.length} ${bucketLabel.toLowerCase()}`}
          </h3>
        </div>
        {tickets.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              {empty.title}
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>{empty.body}</div>
          </div>
        ) : (
          <>
            {/* Phones get cards (the table needs sideways scrolling there). */}
            <div className="gw-mobile-cards" style={{ gap: 0 }}>
              {tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/portal/tasks/${t.id}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "14px 20px",
                    borderBottom: "1px solid var(--gw-border)",
                    textDecoration: "none",
                    color: "var(--gw-fg)",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>
                    {t.category && (
                      <span
                        className={`rsd-chip ${t.category.chip_class}`}
                        title={t.category.name}
                        style={{ display: "inline-block", width: 9, height: 9, padding: 0, borderRadius: "50%", marginRight: 7, verticalAlign: "middle", flexShrink: 0 }}
                      />
                    )}
                    {t.description.split("\n")[0]}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {progressByParent.has(t.id) && (
                      <span className="rsd-chip rsd-chip-mute">
                        To-dos · {progressByParent.get(t.id)!.done}/{progressByParent.get(t.id)!.total}
                      </span>
                    )}
                    <TaskScheduleChips
                      startOn={t.start_on}
                      dueOn={t.due_on}
                      someday={t.someday}
                      status={t.status}
                      today={today}
                    />
                    {decisionChip(t)}
                    {t.priority && (
                      <span className={`rsd-chip ${t.priority.chip_class}`}>{t.priority.label}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                    {t.area?.name ?? "No area"} · {formatDate(t.created_at)}
                    {staff && t.submitted_by && submitterMap[t.submitted_by]
                      ? ` · ${memberDisplayName(submitterMap[t.submitted_by])}`
                      : ""}
                  </div>
                </Link>
              ))}
            </div>

            <table className="rsd-tbl gw-desktop-table">
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
                    progress={progressByParent.get(t.id) ?? null}
                    today={today}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      )}
    </>
  );
}

function isValidBucket(s: string | undefined): s is Bucket {
  return s === "active" || s === "upcoming" || s === "someday" || s === "done";
}

function emptyCopy(bucket: Bucket, view: "all" | "projects", staff: boolean): { title: string; body: string } {
  if (view === "projects") {
    return { title: "Nothing with to-dos yet", body: "Add to-dos to any item to break it into steps." };
  }
  switch (bucket) {
    case "active":
      return {
        title: "Nothing active right now",
        body: staff ? "Scheduled and someday items are tucked away in the other tabs." : "Submit one with + New task above.",
      };
    case "upcoming":
      return { title: "Nothing scheduled for later", body: "Give a task a start date and it'll wait here until then." };
    case "someday":
      return { title: "Nothing parked for someday", body: "Set a task to Someday to park it out of the active list." };
    case "done":
      return { title: "Nothing completed yet", body: "Finished tasks land here." };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABELS: Record<TicketRow["status"], string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

// Mobile-card status: same logic as QueueRow — decision first while it's the
// headline (pending/declined), then the work status.
function decisionChip(t: TicketRow) {
  if (t.review_status === "pending_review")
    return <span className="rsd-chip rsd-chip-warn">Pending review</span>;
  if (t.review_status === "declined")
    return <span className="rsd-chip rsd-chip-warn">Declined</span>;
  return (
    <>
      {t.reviewed_at && <span className="rsd-chip rsd-chip-accent">Approved</span>}
      <span className="rsd-chip rsd-chip-mute">{STATUS_LABELS[t.status]}</span>
    </>
  );
}
