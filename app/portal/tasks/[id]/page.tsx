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
  VotePanel,
  CostInput,
  PromoteToProject,
} from "./Actions";
import { CommentThread, type ThreadComment } from "./CommentThread";
import { ReelNotesCard, type LinkedRecording } from "./ReelNotesCard";
import { majorityThreshold } from "../../../../lib/votes/threshold";
import { loadConflictsForTicket } from "../../../../lib/requests/conflict-loader";
import { LinkedContacts } from "../../contacts/_shared/LinkedContacts";
import {
  loadLinkedContactsForEntity,
  loadContactPickerOptions,
} from "../../contacts/_shared/data";

interface RequestDetails {
  kind?: string;
  subTypeLabel?: string;
  purpose?: string;
  eventType?: string;
  eventTypeLabel?: string;
  classTitle?: string;
  audience?: string;
  speakerName?: string;
  topic?: string;
  alcohol?: boolean;
  decorations?: string;
  hasFee?: boolean;
  outsideInstructor?: boolean;
  requesterKind?: "member" | "outside";
  outsideOrg?: string;
  contact?: string;
  spaces?: string[];
  date?: string;
  startTime?: string;
  endTime?: string;
  recurring?: boolean;
  recurrenceNote?: string;
  headcount?: string;
  children?: string;
  needs?: string[];
  accessPerson?: string;
  hasKey?: boolean;
  selfCleanup?: boolean;
  paidActivity?: boolean;
  insuranceAck?: boolean;
  notes?: string;
}

interface Ticket {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  review_status: "pending_review" | "approved" | "declined";
  cost: number | null;
  decline_reason: string | null;
  reviewed_at: string | null;
  details: RequestDetails | null;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  assigned_to: string | null;
  category: { name: string; chip_class: string } | null;
  project: { id: string; title: string } | null;
  area: { id: string; name: string } | null;
  priority: { id: string; label: string; chip_class: string } | null;
  assignee: { id: string; full_name: string | null; email: string } | null;
}

interface Comment extends ThreadComment {}

interface StaffMember {
  id: string;
  user_id: string | null;
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
      `id, description, status, review_status, decline_reason, reviewed_at, details, cost, created_at, updated_at, submitted_by, assigned_to,
       category:task_categories(name, chip_class),
       project:projects(id, title),
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
  let comments = (commentsRaw as unknown as Comment[]) ?? [];

  // B2: Slack thread replies arrive with no member author; external_author
  // carries the Slack display name (post-0053). Fetched separately + merged
  // as a synthetic author so the thread renders them like any other comment.
  // Pre-0053 the select errors into an empty map.
  {
    const { data: extRows } = await supabase
      .from("ticket_comments")
      .select("id, external_author")
      .eq("ticket_id", id)
      .not("external_author", "is", null);
    const extById = new Map(
      ((extRows as { id: string; external_author: string }[] | null) ?? []).map(r => [
        r.id,
        r.external_author,
      ])
    );
    if (extById.size > 0) {
      comments = comments.map(c =>
        !c.author && extById.has(c.id)
          ? { ...c, author: { full_name: extById.get(c.id)!, email: "", avatar_url: null } }
          : c
      );
    }
  }

  let staffList: StaffMember[] = [];
  if (staff) {
    const { data: staffRows } = await supabase
      .from("members")
      .select("id, user_id, full_name, email")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved")
      .order("full_name", { ascending: true });
    staffList = staffRows ?? [];
  }

  // Committee votes (staff, while pending). Gracefully empty until migration
  // 0050 (request_votes) is applied — a missing table just yields no rows.
  let voteRows: { voter_id: string; vote: "yes" | "no"; note: string | null }[] = [];
  if (staff && ticket.review_status === "pending_review") {
    const { data: vr } = await supabase
      .from("request_votes")
      .select("voter_id, vote, note")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    voteRows = (vr as typeof voteRows) ?? [];
  }

  // Schedule conflicts (staff, while pending): does this request's space/date/
  // time overlap a confirmed reservation or another open request?
  const conflicts =
    staff && ticket.review_status === "pending_review"
      ? await loadConflictsForTicket(supabase, {
          id: ticket.id,
          details: ticket.details as unknown as Record<string, unknown> | null,
        })
      : [];
  const eligibleVoters = staffList.filter((s) => s.user_id);
  const voteThreshold = majorityThreshold(eligibleVoters.length);
  const staffNameByUserId: Record<string, string> = {};
  for (const s of eligibleVoters) staffNameByUserId[s.user_id as string] = s.full_name ?? s.email;
  const votesForPanel = voteRows.map((v) => ({
    voterName: staffNameByUserId[v.voter_id] ?? "Committee member",
    vote: v.vote,
    note: v.note,
    isMe: v.voter_id === user.id,
  }));
  const votedIds = new Set(voteRows.map((v) => v.voter_id));
  const waitingOn = eligibleVoters
    .filter((s) => !votedIds.has(s.user_id as string))
    .map((s) => (s.full_name ?? s.email).split(" ")[0]);
  const myVote = voteRows.find((v) => v.voter_id === user.id)?.vote ?? null;

  // Committee decision history (staff). Gracefully empty until migration 0048
  // (task_review_log) is applied — a missing table just yields no rows.
  let reviewLog: {
    id: string;
    changed_at: string;
    new_status: string;
    reason: string | null;
    actor: string;
  }[] = [];
  if (staff) {
    const { data: logRows } = await supabase
      .from("task_review_log")
      .select("id, changed_at, new_status, reason, changed_by")
      .eq("ticket_id", id)
      .order("changed_at", { ascending: false });
    const rows =
      (logRows as unknown as {
        id: string;
        changed_at: string;
        new_status: string;
        reason: string | null;
        changed_by: string | null;
      }[]) ?? [];
    const actorIds = Array.from(new Set(rows.map((r) => r.changed_by).filter((v): v is string => Boolean(v))));
    const nameMap: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: actors } = await supabase.from("members").select("user_id, full_name, email").in("user_id", actorIds);
      for (const a of actors ?? []) nameMap[a.user_id] = a.full_name ?? a.email;
    }
    reviewLog = rows.map((r) => ({
      id: r.id,
      changed_at: r.changed_at,
      new_status: r.new_status,
      reason: r.reason,
      actor: r.changed_by ? nameMap[r.changed_by] ?? "Someone" : "Someone",
    }));
  }

  // ReelNotes recordings captured on this task (B3). Tolerant pre-0052: a
  // missing linked_ticket_id column errors into an empty list.
  let linkedRecordings: LinkedRecording[] = [];
  if (staff) {
    const { data: recRows } = await supabase
      .from("daves_idea_recordings")
      .select("id, title, status, created_at")
      .eq("linked_ticket_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    linkedRecordings = (recRows as LinkedRecording[] | null) ?? [];
  }

  // Vendors / external contacts attached to this ticket. Staff-only —
  // RLS hides everything for non-staff, but skip the queries to save a
  // round-trip when we know they won't show.
  const linkedContacts = staff
    ? await loadLinkedContactsForEntity("maintenance_ticket", ticket.id)
    : [];
  const contactPickerOptions = staff ? await loadContactPickerOptions() : [];

  const canComment = staff || ticket.submitted_by === user.id;

  const reqWhat =
    ticket.details?.eventTypeLabel || ticket.details?.classTitle || ticket.details?.purpose || ticket.details?.subTypeLabel;
  const promoteTitle = reqWhat
    ? `${reqWhat}${ticket.details?.outsideOrg ? ` — ${ticket.details.outsideOrg}` : ""}`
    : truncate(ticket.description, 60);

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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", flex: 1, minWidth: 0 }}>
          {truncate(ticket.description, 80)}
        </h2>
        <Link
          href="/portal/tasks"
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

      <div className="gw-detail-grid">
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Description */}
          <div className="rsd-card" style={{ gap: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {ticket.category && (
                <span className={`rsd-chip ${ticket.category.chip_class}`}>
                  {ticket.category.name}
                </span>
              )}
              {ticket.priority && (
                <span className={`rsd-chip ${ticket.priority.chip_class}`}>
                  {ticket.priority.label}
                </span>
              )}
              {statusChip(ticket.status)}
              {reviewChip(ticket)}
              {ticket.area && <Pill>{ticket.area.name}</Pill>}
              {ticket.project && (
                <Link
                  href={`/portal/tasks/projects/${ticket.project.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 100,
                    background: "var(--gw-bg-elev)",
                    border: "1px solid var(--gw-border)",
                    color: "var(--rsd-accent)",
                    textDecoration: "none",
                  }}
                >
                  <Icons.LayoutDashboard width={11} height={11} />
                  {ticket.project.title}
                </Link>
              )}
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

          {ticket.review_status === "declined" && ticket.decline_reason && (
            <div className="rsd-card" style={{ gap: 6, borderColor: "var(--gw-error)" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-error)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Declined
              </span>
              <div style={{ fontSize: 14, color: "var(--gw-fg)", lineHeight: 1.6 }}>{ticket.decline_reason}</div>
            </div>
          )}

          {["gym", "building-use", "use-a-space", "event", "class"].includes(ticket.details?.kind ?? "") && (
            <RequestDetailsCard d={ticket.details!} />
          )}

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

          {staff && ticket.review_status === "pending_review" && ticket.details?.recurring && (
            <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5, padding: "2px 2px" }}>
              ↻ This request repeats — only its first date was checked for conflicts. Double-check the
              other dates against the calendar.
            </div>
          )}

          {conflicts.length > 0 && (
            <div
              className="rsd-card"
              style={{
                gap: 8,
                background: "var(--gw-error-bg)",
                border: "1px solid rgba(229,62,62,.3)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-error)", textTransform: "uppercase", letterSpacing: ".04em", display: "flex", alignItems: "center", gap: 6 }}>
                <Icons.AlertTriangle width={14} height={14} />
                Possible schedule conflict
              </h3>
              <div style={{ fontSize: 13, color: "var(--gw-fg)", lineHeight: 1.55 }}>
                The requested space is already spoken for at this time:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {conflicts.map((c) => (
                  <div key={`${c.source}-${c.id}`} style={{ fontSize: 13, color: "var(--gw-fg)" }}>
                    <span style={{ fontWeight: 700 }}>{c.spaces.join(", ")}</span> · {c.when} —{" "}
                    {c.source === "event" ? (
                      <>
                        <span>{c.title}</span>{" "}
                        <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>on the calendar</span>
                      </>
                    ) : (
                      <>
                        <a href={`/portal/tasks/${c.id}`} style={{ color: "var(--rsd-accent)", fontWeight: 600 }}>
                          {c.title}
                        </a>{" "}
                        <span className="rsd-chip rsd-chip-warn" style={{ fontSize: 10 }}>also pending</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
                Not a hard block — just a heads-up for the committee.
              </div>
            </div>
          )}

          {staff && ticket.review_status === "pending_review" && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Committee decision
              </h3>
              <DecisionChecklist />
              <VotePanel
                ticketId={ticket.id}
                votes={votesForPanel}
                yesCount={votesForPanel.filter((v) => v.vote === "yes").length}
                noCount={votesForPanel.filter((v) => v.vote === "no").length}
                threshold={voteThreshold}
                waitingOn={waitingOn}
                myVote={myVote}
              />
            </div>
          )}

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
              <CostInput ticketId={ticket.id} current={ticket.cost} />
              {ticket.review_status === "approved" && !ticket.project && (
                <PromoteToProject ticketId={ticket.id} defaultTitle={promoteTitle} />
              )}
              {superAdmin && <DeleteButton ticketId={ticket.id} />}
            </div>
          )}

          {staff && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                ReelNotes
              </h3>
              <ReelNotesCard ticketId={ticket.id} recordings={linkedRecordings} />
            </div>
          )}

          {staff && reviewLog.length > 0 && (
            <div className="rsd-card" style={{ gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Decision history
              </h3>
              {reviewLog.map((e) => (
                <div key={e.id} style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 8, borderBottom: "1px solid var(--gw-border)" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>
                    {reviewLabel(e.new_status)} <span style={{ fontWeight: 500, color: "var(--gw-fg-muted)" }}>by {e.actor}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--gw-fg-faint)" }}>{formatDateTime(e.changed_at)}</div>
                  {e.reason && <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>{e.reason}</div>}
                </div>
              ))}
            </div>
          )}

          {staff && (
            <LinkedContacts
              entityType="maintenance_ticket"
              entityId={ticket.id}
              links={linkedContacts}
              allContacts={contactPickerOptions}
              canEdit={staff}
            />
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

function reviewLabel(s: string): string {
  if (s === "pending_review") return "Sent for review";
  if (s === "approved") return "Approved";
  if (s === "declined") return "Declined";
  return s;
}

function reviewChip(ticket: Ticket) {
  const s = ticket.review_status;
  if (s === "pending_review") return <span className="rsd-chip rsd-chip-warn">Pending review</span>;
  if (s === "declined") return <span className="rsd-chip rsd-chip-error">Declined</span>;
  // Only show "Approved" when the committee actually reviewed it (reviewed_at
  // set) — auto-approved repairs and plain tasks show no review chip.
  if (s === "approved" && ticket.reviewed_at) return <span className="rsd-chip rsd-chip-success">Approved</span>;
  return null;
}

function DecisionChecklist() {
  const items = [
    "Schedule conflict?",
    "Member or outside group?",
    "Fee or suggested donation?",
    "Insurance / liability?",
    "Supervision (especially kids)?",
    "Cleanup / damage risk?",
    "Who opens & locks up?",
    "Fits our mission?",
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        Things to weigh
      </span>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
        {items.map((i) => (
          <li key={i} style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestDetailsCard({ d }: { d: RequestDetails }) {
  const time = [d.startTime, d.endTime].filter(Boolean).join("–");
  const when = [d.date, time].filter(Boolean).join(" ");
  const rows: [string, string][] = [];
  const what = d.eventTypeLabel || d.classTitle || d.purpose || d.subTypeLabel;
  if (what) rows.push(["What", what]);
  if (d.audience) rows.push(["Open to", d.audience]);
  rows.push([
    "Requested by",
    d.requesterKind === "outside" ? `Outside group${d.outsideOrg ? ` — ${d.outsideOrg}` : ""}` : "MCC",
  ]);
  if (d.spaces?.length) rows.push(["Space(s)", d.spaces.join(", ")]);
  if (when) rows.push(["When", `${when}${d.recurring ? ` · recurring${d.recurrenceNote ? ` (${d.recurrenceNote})` : ""}` : ""}`]);
  if (d.headcount) rows.push(["People", `${d.headcount}${d.children ? ` · ${d.children} children` : ""}`]);
  if (d.speakerName) rows.push(["Speaker", `${d.speakerName}${d.topic ? ` — ${d.topic}` : ""}`]);
  if (d.needs?.length) rows.push(["Needs", d.needs.join(", ")]);
  const access = [d.accessPerson, d.hasKey ? "has key/code" : "", d.selfCleanup ? "self setup & cleanup" : ""]
    .filter(Boolean)
    .join(" · ");
  if (access) rows.push(["Access", access]);
  if (d.alcohol) rows.push(["Alcohol", "Will be served"]);
  if (d.hasFee) rows.push(["Cost", "There's a cost to attend"]);
  if (d.paidActivity) rows.push(["Paid activity", d.insuranceAck ? "can provide insurance/waiver" : "yes"]);
  if (d.contact) rows.push(["Contact", d.contact]);

  return (
    <div className="rsd-card" style={{ gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        Request details
      </h3>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--gw-border)" }}>
            <span style={{ flex: "0 0 120px", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".03em" }}>
              {k}
            </span>
            <span style={{ flex: 1, fontSize: 13.5, color: "var(--gw-fg)", fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
      {d.notes && (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6, fontStyle: "italic" }}>
          &ldquo;{d.notes}&rdquo;
        </div>
      )}
    </div>
  );
}
