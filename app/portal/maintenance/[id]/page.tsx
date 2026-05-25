import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import {
  isStaff,
  isSuperAdmin,
  type MemberLike,
} from "../../../../lib/auth/permissions";
import {
  StatusSelect,
  AssignSelect,
  CommentForm,
  DeleteButton,
} from "./Actions";
import { CommentThread, type ThreadComment } from "./CommentThread";

interface Ticket {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  assigned_to: string | null;
  area: { id: string; name: string } | null;
  priority: { id: string; label: string; chip_class: string } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
}

interface Comment extends ThreadComment {}

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string;
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: ticketRaw } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, created_at, updated_at, submitted_by, assigned_to,
       area:areas(id, name),
       priority:priorities(id, label, chip_class),
       assignee:members!assigned_to(id, full_name, email)`
    )
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();

  if (!ticketRaw) notFound();
  const ticket = ticketRaw as unknown as Ticket;

  let submitter: { full_name: string | null; email: string } | null = null;
  if (ticket.submitted_by) {
    const { data: sub } = await supabase
      .from("members")
      .select("full_name, email")
      .eq("user_id", ticket.submitted_by)
      .maybeSingle();
    submitter = sub ?? null;
  }

  const { data: commentsRaw } = await supabase
    .from("ticket_comments")
    .select(
      `id, body, created_at, author_id, parent_id,
       author:members!author_id(full_name, email, avatar_url)`
    )
    .eq("ticket_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const comments = (commentsRaw as unknown as Comment[]) ?? [];

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

  const canComment = staff || ticket.submitted_by === user.id;

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            Facilities · Request
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            {truncate(ticket.description, 80)}
          </h2>
        </div>
        <Link
          href="/portal/maintenance"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to queue
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 20, alignItems: "flex-start" }}>
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Description */}
          <div className="rsd-card" style={{ gap: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {ticket.priority && (
                <span className={`rsd-chip ${ticket.priority.chip_class}`}>
                  {ticket.priority.label}
                </span>
              )}
              {statusChip(ticket.status)}
              {ticket.area && <Pill>{ticket.area.name}</Pill>}
            </div>
            <div style={{ fontSize: 14, color: "var(--gw-fg)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {ticket.description}
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, flexWrap: "wrap" }}>
              <span>
                Submitted by{" "}
                <strong style={{ color: "var(--gw-fg)" }}>
                  {submitter ? submitter.full_name ?? submitter.email : "Unknown"}
                </strong>
              </span>
              <span>· {formatDateTime(ticket.created_at)}</span>
            </div>
          </div>

          {/* Comments */}
          <div className="rsd-card" style={{ gap: 14, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--gw-border)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </h3>
            </div>
            <CommentThread
              ticketId={ticket.id}
              comments={comments}
              canComment={canComment}
            />
            {canComment && (
              <div
                style={{
                  padding: "14px 18px",
                  borderTop: comments.length > 0 ? "1px solid var(--gw-border)" : "none",
                }}
              >
                <CommentForm ticketId={ticket.id} />
              </div>
            )}
          </div>
        </div>

        {/* Side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
          <div className="rsd-card" style={{ gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Details
            </h3>
            <Field label="Area" value={ticket.area?.name ?? "—"} />
            <Field
              label="Priority"
              value={
                ticket.priority ? (
                  <span className={`rsd-chip ${ticket.priority.chip_class}`}>{ticket.priority.label}</span>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Status" value={statusChip(ticket.status)} />
            <Field label="Created" value={formatDateTime(ticket.created_at)} />
            {ticket.updated_at !== ticket.created_at && (
              <Field label="Updated" value={formatDateTime(ticket.updated_at)} />
            )}
            <Field
              label="Assigned to"
              value={
                ticket.assignee
                  ? ticket.assignee.full_name ?? ticket.assignee.email
                  : <span style={{ color: "var(--gw-fg-muted)" }}>Unassigned</span>
              }
            />
          </div>

          {staff && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Actions
              </h3>
              <StatusSelect ticketId={ticket.id} current={ticket.status} />
              <AssignSelect
                ticketId={ticket.id}
                current={ticket.assigned_to}
                staff={staffList}
              />
              {superAdmin && <DeleteButton ticketId={ticket.id} />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>{value}</span>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 100,
        background: "var(--gw-bg-elev)",
        border: "1px solid var(--gw-border)",
        fontSize: 12,
        fontWeight: 700,
        color: "var(--gw-fg)",
      }}
    >
      {children}
    </span>
  );
}

function statusChip(s: Ticket["status"]) {
  if (s === "open") return <span className="rsd-chip rsd-chip-warn">Open</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "cancelled") return <span className="rsd-chip rsd-chip-mute">Cancelled</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
