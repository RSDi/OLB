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
  PrioritySelect,
  AssignSelect,
  CommentForm,
  DeleteButton,
  VotePanel,
  AddSubtask,
  WhenControl,
  DeadlineControl,
} from "./Actions";
import { TaskScheduleChips } from "../QueueRow";
import { SubtaskRow } from "./SubtaskRow";
import { churchToday } from "../../../../lib/dates/today";
import { CommentThread, type ThreadComment } from "./CommentThread";
import {
  loadRecordingsForComments,
  loadSubtaskRecordingLinks,
  loadThingsEnabled,
  loadAssignableMembers,
  type AssignableMember,
} from "../../../../lib/reelnotes/data";
import { ProcedureRunner } from "../../../components/ProcedureRunner";
import { ShutdownOptOutButton } from "./ShutdownOptOutButton";
import { ShutdownTaskAssign } from "./ShutdownTaskAssign";
import { loadConflictsForTicket } from "../../../../lib/requests/conflict-loader";
import { formatDateLabel } from "../../../../lib/requests/recurrence";
import { LinkedContacts } from "../../contacts/_shared/LinkedContacts";
import {
  loadLinkedContactsForEntity,
  loadContactPickerOptions,
} from "../../contacts/_shared/data";
import { memberDisplayName, memberFirstName } from "../../../../lib/members/display";

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
  event_id: string | null;
  parent_id: string | null;
  start_on: string | null;
  due_on: string | null;
  someday: boolean;
  category: { name: string; chip_class: string } | null;
  area: { id: string; name: string } | null;
  priority: { id: string; label: string; chip_class: string } | null;
  assignee: { id: string; full_name: string | null; nickname: string | null; email: string } | null;
}

type Comment = ThreadComment;

interface Subtask {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  start_on: string | null;
  due_on: string | null;
  priority: { label: string; chip_class: string } | null;
  assignee: { id: string; full_name: string | null; nickname: string | null; email: string } | null;
}

interface StaffMember {
  id: string;
  user_id: string | null;
  full_name: string | null;
  nickname: string | null;
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
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as MemberLike | null) ?? null;
  const viewerMemberId = (meRow as { id?: string } | null)?.id ?? null;
  const staff = isStaff(me);
  const superAdmin = isSuperAdmin(me);

  const { data: ticketRaw } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, review_status, decline_reason, reviewed_at, details, cost, created_at, updated_at, submitted_by, assigned_to, event_id, parent_id, start_on, due_on, someday,
       category:task_categories(name, chip_class),
       area:areas(id, name),
       priority:priorities(id, label, chip_class),
       assignee:members!assigned_to(id, full_name, nickname, email)`
    )
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();

  if (!ticketRaw) notFound();
  const ticket = ticketRaw as unknown as Ticket;

  // Parent ("project") this task belongs to, if it's a sub-task — for the
  // breadcrumb. Separate query so it stays tolerant pre-0068 (no parent_id).
  let parentTask: { id: string; description: string } | null = null;
  if (ticket.parent_id) {
    const { data: par } = await supabase
      .from("maintenance_requests")
      .select("id, description")
      .eq("id", ticket.parent_id)
      .is("deleted_at", null)
      .maybeSingle();
    parentTask = (par as { id: string; description: string } | null) ?? null;
  }

  // Sub-tasks of this task — it's a "project" when it has any. A member sees
  // sub-tasks under their own task via RLS (0068); staff see all.
  const { data: childRows } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, start_on, due_on,
       priority:priorities(label, chip_class),
       assignee:members!assigned_to(id, full_name, nickname, email)`
    )
    .eq("parent_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  const subtasks = (childRows as unknown as Subtask[]) ?? [];
  const doneCount = subtasks.filter((s) => s.status === "done").length;
  // For sub-tasks created from a recorded note: the source audio + moment, so
  // the row can offer "play from this point".
  const subtaskRecordingLinks =
    subtasks.length > 0
      ? await loadSubtaskRecordingLinks(subtasks.map((s) => s.id))
      : new Map<string, { audioUrl: string | null; transcriptMs: number | null }>();
  // Only a top-level task can hold sub-tasks (one level). Members manage their
  // own; staff manage any.
  const canManageSubtasks = ticket.parent_id === null && (staff || ticket.submitted_by === user.id);

  // Scheduling (When / Someday / Deadline): staff or the owner, once approved.
  const today = churchToday();
  const canSchedule = (staff || ticket.submitted_by === user.id) && ticket.review_status === "approved";

  // Building-shutdown task (Phase 2b): if this task is linked to an event with
  // a shutdown procedure, surface the run-wizard + opt-out so the assignee (not
  // just staff) can work it. Events + playbooks are readable by any approved
  // member, so the non-staff assignee can load this.
  let shutdownProc:
    | { procedureId: string; title: string; steps: string[]; willNotify: boolean; eventTitle: string; whenLabel: string | null }
    | null = null;
  if (ticket.event_id) {
    const { data: evRow } = await supabase
      .from("events")
      .select("title, start_at, shutdown_procedure_id")
      .eq("id", ticket.event_id)
      .maybeSingle();
    const evp = evRow as { title: string; start_at: string | null; shutdown_procedure_id: string | null } | null;
    if (evp?.shutdown_procedure_id) {
      const { data: pp } = await supabase
        .from("playbook_procedures")
        .select("id, title, steps, notify, slack_channel")
        .eq("id", evp.shutdown_procedure_id)
        .is("deleted_at", null)
        .maybeSingle();
      const p = pp as { id: string; title: string; steps: { label: string }[] | null; notify: boolean; slack_channel: string | null } | null;
      const steps = (p?.steps ?? []).map((s) => s.label).filter(Boolean);
      if (p && steps.length > 0) {
        shutdownProc = {
          procedureId: p.id,
          title: p.title,
          steps,
          willNotify: !!p.notify && !!p.slack_channel,
          eventTitle: evp.title,
          whenLabel: evp.start_at ? formatDateTime(evp.start_at) : null,
        };
      }
    }
  }

  // The Building Shutdown team roster, for the staff assign control on a
  // shutdown task (Phase 2c). Non-staff assignees don't get this.
  let shutdownTeam: { id: string; fullName: string }[] = [];
  if (shutdownProc && staff) {
    const { data: team } = await supabase
      .from("volunteer_teams")
      .select("id")
      .eq("name", "Building Shutdown")
      .maybeSingle();
    const teamId = (team as { id: string } | null)?.id ?? null;
    if (teamId) {
      const { data: rows } = await supabase
        .from("member_volunteer_teams")
        .select("member:members(id, full_name, nickname, email)")
        .eq("team_id", teamId);
      shutdownTeam = ((rows as unknown as { member: { id: string; full_name: string | null; nickname: string | null; email: string | null } | null }[]) ?? [])
        .map((r) => r.member)
        .filter((m): m is { id: string; full_name: string | null; nickname: string | null; email: string | null } => !!m)
        .map((m) => ({ id: m.id, fullName: memberDisplayName(m) }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
  }

  let submitter: { full_name: string | null; nickname: string | null; email: string } | null = null;
  if (ticket.submitted_by) {
    const { data: sub } = await supabase
      .from("members")
      .select("full_name, nickname, email")
      .eq("user_id", ticket.submitted_by)
      .maybeSingle();
    submitter = sub ?? null;
  }

  const { data: commentsRaw } = await supabase
    .from("ticket_comments")
    .select(
      `id, body, created_at, author_id, parent_id,
       author:members!author_id(full_name, nickname, email, avatar_url)`
    )
    .eq("ticket_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  // recording_id defaults null; a separate tolerant query fills it (below) so a
  // pre-0065 schema can't error the whole comments load.
  let comments = ((commentsRaw as unknown as Comment[]) ?? []).map(c => ({ ...c, recording_id: c.recording_id ?? null }));

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
          ? { ...c, author: { full_name: extById.get(c.id)!, nickname: null, email: "", avatar_url: null, external: true } }
          : c
      );
    }
  }

  // Recorded comments carry a recording_id (0065). Fetched separately + merged
  // so a pre-0065 schema errors into an empty map instead of breaking the
  // comments load (mirrors the external_author pattern above).
  {
    const { data: recRows } = await supabase
      .from("ticket_comments")
      .select("id, recording_id")
      .eq("ticket_id", id)
      .not("recording_id", "is", null);
    const recIdByComment = new Map(
      ((recRows as { id: string; recording_id: string }[] | null) ?? []).map(r => [r.id, r.recording_id])
    );
    if (recIdByComment.size > 0) {
      comments = comments.map(c =>
        recIdByComment.has(c.id) ? { ...c, recording_id: recIdByComment.get(c.id)! } : c
      );
    }
  }

  // Attach the recording (+ its action items) behind any recorded comments so
  // the thread renders them inline. Staff-only via RLS.
  if (staff) {
    const recIds = comments.map((c) => c.recording_id).filter((v): v is string => Boolean(v));
    if (recIds.length > 0) {
      const recMap = await loadRecordingsForComments(recIds);
      comments = comments.map((c) =>
        c.recording_id && recMap.has(c.recording_id)
          ? { ...c, recording: recMap.get(c.recording_id)! }
          : c
      );
    }
  }

  let staffList: StaffMember[] = [];
  let priorityOptions: { id: string; label: string; chip_class: string }[] = [];
  if (staff) {
    const { data: staffRows } = await supabase
      .from("members")
      .select("id, user_id, full_name, nickname, email")
      .in("role", ["admin", "super_admin"])
      .eq("status", "approved")
      .order("full_name", { ascending: true });
    staffList = staffRows ?? [];
    const { data: prioRows } = await supabase
      .from("priorities")
      .select("id, label, chip_class")
      .is("deleted_at", null)
      .order("severity", { ascending: true });
    priorityOptions = prioRows ?? [];
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
  const staffNameByUserId: Record<string, string> = {};
  for (const s of eligibleVoters) staffNameByUserId[s.user_id as string] = memberDisplayName(s);
  const votesForPanel = voteRows.map((v) => ({
    voterName: staffNameByUserId[v.voter_id] ?? "Committee member",
    vote: v.vote,
    note: v.note,
    isMe: v.voter_id === user.id,
  }));
  const votedIds = new Set(voteRows.map((v) => v.voter_id));
  const waitingOn = eligibleVoters
    .filter((s) => !votedIds.has(s.user_id as string))
    .map((s) => memberFirstName(s));
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
      const { data: actors } = await supabase.from("members").select("user_id, full_name, nickname, email").in("user_id", actorIds);
      for (const a of actors ?? []) nameMap[a.user_id] = memberDisplayName(a);
    }
    reviewLog = rows.map((r) => ({
      id: r.id,
      changed_at: r.changed_at,
      new_status: r.new_status,
      reason: r.reason,
      actor: r.changed_by ? nameMap[r.changed_by] ?? "Someone" : "Someone",
    }));
  }

  // Whether the viewer has opted into the device-only Things push (0064);
  // gates the per-action-item Things button on recorded comments. Plus the
  // directory members an action item can be assigned to. Staff only.
  let thingsEnabled = false;
  let assignableMembers: AssignableMember[] = [];
  if (staff) {
    [thingsEnabled, assignableMembers] = await Promise.all([
      loadThingsEnabled(),
      loadAssignableMembers(),
    ]);
  }

  // Vendors / external contacts attached to this ticket. Staff-only —
  // RLS hides everything for non-staff, but skip the queries to save a
  // round-trip when we know they won't show.
  const linkedContacts = staff
    ? await loadLinkedContactsForEntity("maintenance_ticket", ticket.id)
    : [];
  const contactPickerOptions = staff ? await loadContactPickerOptions() : [];

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
              {/* Priority / Status / Assigned-to: editable oval pills for staff
                  (no labels — the info panel explains them), read-only chips
                  otherwise. These are the single home for these fields now. */}
              {staff ? (
                <>
                  <PrioritySelect ticketId={ticket.id} current={ticket.priority?.id ?? ""} priorities={priorityOptions} />
                  <StatusSelect ticketId={ticket.id} current={ticket.status} />
                  <AssignSelect ticketId={ticket.id} current={ticket.assigned_to} staff={staffList} />
                </>
              ) : (
                <>
                  {ticket.priority && (
                    <span className={`rsd-chip ${ticket.priority.chip_class}`}>{ticket.priority.label}</span>
                  )}
                  {statusChip(ticket.status)}
                  {ticket.assignee && (
                    <span className="rsd-chip rsd-chip-mute">{memberDisplayName(ticket.assignee)}</span>
                  )}
                </>
              )}
              {reviewChip(ticket)}
              <TaskScheduleChips
                startOn={ticket.start_on}
                dueOn={ticket.due_on}
                someday={ticket.someday}
                status={ticket.status}
                today={today}
              />
              {ticket.area && <Pill>{ticket.area.name}</Pill>}
              {parentTask && (
                <Link
                  href={`/portal/tasks/${parentTask.id}`}
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
                  Part of: {truncate(parentTask.description.split("\n")[0], 40)}
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
                  {submitter ? memberDisplayName(submitter) : "Unknown"}
                </strong>
              </span>
              <span>· {formatDateTime(ticket.created_at)}</span>
            </div>
          </div>

          {/* Building shutdown (Phase 2b): run-wizard + opt-out for the assignee. */}
          {shutdownProc && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Building shutdown · {shutdownProc.eventTitle}
                {shutdownProc.whenLabel ? ` · ${shutdownProc.whenLabel}` : ""}
              </div>
              {ticket.status === "done" ? (
                <div className="rsd-card" style={{ border: "1px solid var(--rsd-accent)", background: "var(--rsd-accent-bg)", fontSize: 13.5, fontWeight: 700, color: "var(--gw-fg)" }}>
                  ✓ Building shutdown complete.
                </div>
              ) : (
                <>
                  {staff && (
                    <ShutdownTaskAssign
                      taskId={ticket.id}
                      teamMembers={shutdownTeam}
                      assigneeId={ticket.assigned_to}
                      assigneeName={ticket.assignee ? memberDisplayName(ticket.assignee) : null}
                    />
                  )}
                  <ProcedureRunner
                    procedureId={shutdownProc.procedureId}
                    title={shutdownProc.title}
                    steps={shutdownProc.steps}
                    willNotify={shutdownProc.willNotify}
                    eventId={ticket.event_id ?? undefined}
                    taskId={ticket.id}
                    startLabel="Start shutdown"
                  />
                  {ticket.assigned_to && <ShutdownOptOutButton taskId={ticket.id} />}
                </>
              )}
            </div>
          )}

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

          {/* To-Dos: the child tasks that break this one into steps. */}
          {(subtasks.length > 0 || canManageSubtasks) && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                To-Dos
                {subtasks.length > 0 && (
                  <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}> · {doneCount}/{subtasks.length} done</span>
                )}
              </h3>
              {subtasks.length > 0 ? (
                <>
                  <ProgressBar done={doneCount} total={subtasks.length} />
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {subtasks.map((s) => (
                      <SubtaskRow
                        key={s.id}
                        subtask={s}
                        today={today}
                        canManage={staff}
                        canEdit={canManageSubtasks}
                        staffList={staffList.map((m) => ({ id: m.id, full_name: m.full_name, nickname: m.nickname, email: m.email }))}
                        thingsEnabled={thingsEnabled}
                        recordingLink={subtaskRecordingLinks.get(s.id) ?? null}
                      />
                    ))}
                  </div>
                </>
              ) : (
                canManageSubtasks && (
                  <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
                    Break this into smaller pieces — add a to-do or two.
                  </div>
                )
              )}
              {canManageSubtasks && <AddSubtask parentId={ticket.id} />}
            </div>
          )}

          {/* Comments */}
          <div className="rsd-card" style={{ gap: 14, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--gw-border)" }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
                {comments.length} {comments.length === 1 ? "comment" : "comments"}
              </h3>
            </div>
            {/* Composer sits at the top so Record / Post comment are right under
                the header, not buried below the whole thread. */}
            {canComment && (
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--gw-border)" }}>
                <CommentForm ticketId={ticket.id} enableRecording={staff} />
              </div>
            )}
            <CommentThread
              ticketId={ticket.id}
              comments={comments}
              canComment={canComment}
              thingsEnabled={thingsEnabled}
              members={assignableMembers}
              viewerMemberId={viewerMemberId}
              isSuperAdmin={superAdmin}
              canPromoteSubtasks={staff && ticket.parent_id === null}
            />
          </div>
        </div>

        {/* Side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
          {canSchedule && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
                Schedule
              </h3>
              <WhenControl taskId={ticket.id} startOn={ticket.start_on} someday={ticket.someday} />
              <DeadlineControl taskId={ticket.id} dueOn={ticket.due_on} />
            </div>
          )}
          <div className="rsd-card" style={{ gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Details
            </h3>
            {/* Category, Priority, Status, Assigned-to, and Area now live as
                pills at the top of the task — Details keeps just the timestamps
                and the delete action. */}
            <Field label="Created" value={formatDateTime(ticket.created_at)} />
            {ticket.updated_at !== ticket.created_at && (
              <Field label="Updated" value={formatDateTime(ticket.updated_at)} />
            )}
            {superAdmin && (
              <div style={{ paddingTop: 6, borderTop: "1px solid var(--gw-border)" }}>
                <DeleteButton ticketId={ticket.id} childCount={subtasks.length} />
              </div>
            )}
          </div>

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
                  <div key={`${c.source}-${c.id}-${c.date}`} style={{ fontSize: 13, color: "var(--gw-fg)" }}>
                    <span style={{ fontWeight: 700 }}>{formatDateLabel(c.date)}</span> · {c.spaces.join(", ")} · {c.when} —{" "}
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
                waitingOn={waitingOn}
                myVote={myVote}
              />
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

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 100, background: "var(--gw-border)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--rsd-accent)", transition: "width 200ms" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", flexShrink: 0 }}>{pct}%</span>
    </div>
  );
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
