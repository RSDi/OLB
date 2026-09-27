import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { getAuthUser } from "../../../../../lib/auth/viewer";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../../lib/auth/permissions";
import { memberDisplayName } from "../../../../../lib/members/display";
import { EventForm, type EventInitialValues } from "../../EventForm";
import { ShutdownAssignment } from "../../ShutdownAssignment";
import { ProcedureRunner } from "../../../../components/ProcedureRunner";
import { loadRunnableProcedures } from "../../../../../lib/playbooks/procedures-data";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  area_id: string | null;
  category_id: string | null;
  shutdown_procedure_id: string | null;
  recurring: boolean;
  recur_freq: string | null;
  recur_weekdays: number[] | null;
  recur_monthly_week: number | null;
  recur_monthly_weekday: number | null;
  recur_until: string | null;
  recur_except: string[] | null;
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as MemberLike | null) ?? null;
  if (!isStaff(me)) redirect("/portal/events");

  const { data: eventRaw } = await supabase
    .from("events")
    .select("id, title, description, start_at, end_at, location, area_id, category_id, shutdown_procedure_id, recurring, recur_freq, recur_weekdays, recur_monthly_week, recur_monthly_weekday, recur_until, recur_except")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!eventRaw) notFound();
  const ev = eventRaw as EventRow;

  const [{ data: areas }, { data: categories }, shutdownProcedures] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("event_categories")
      .select("id, name, chip_class")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Runnable procedures (0066), labeled "Playbook — Procedure".
    loadRunnableProcedures(),
  ]);

  // If a shutdown procedure is linked, load it so we can render the run-wizard
  // (Start shutdown) right on this event's page.
  let shutdownProc:
    | { id: string; title: string; steps: string[]; willNotify: boolean }
    | null = null;
  if (ev.shutdown_procedure_id) {
    const { data: pp } = await supabase
      .from("playbook_procedures")
      .select("id, title, steps, notify, slack_channel")
      .eq("id", ev.shutdown_procedure_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pp) {
      const p = pp as {
        id: string;
        title: string;
        steps: { label: string }[] | null;
        notify: boolean;
        slack_channel: string | null;
      };
      const steps = (p.steps ?? []).map((s) => s.label).filter(Boolean);
      if (steps.length > 0) {
        shutdownProc = { id: p.id, title: p.title, steps, willNotify: !!p.notify && !!p.slack_channel };
      }
    }
  }

  // Phase 2b: the Building Shutdown team roster + this event's current shutdown
  // task (assignee + status), so staff can assign and the runner marks it done.
  let teamMembers: { id: string; fullName: string }[] = [];
  let shutdownTask:
    | { id: string; assigneeId: string | null; assigneeName: string | null; status: string }
    | null = null;
  // A recurring event has many per-occurrence tasks (managed in the queue), so
  // the single assign control only applies to one-off events.
  if (shutdownProc && !ev.recurring) {
    const { data: team } = await supabase
      .from("volunteer_teams")
      .select("id")
      .eq("name", "Building Shutdown")
      .maybeSingle();
    const teamId = (team as { id: string } | null)?.id ?? null;
    if (teamId) {
      const { data: rows } = await supabase
        .from("member_volunteer_teams")
        .select("member:members(id, full_name, nickname)")
        .eq("team_id", teamId);
      teamMembers = ((rows as unknown as { member: { id: string; full_name: string | null; nickname: string | null } | null }[]) ?? [])
        .map((r) => r.member)
        .filter((m): m is { id: string; full_name: string | null; nickname: string | null } => !!m)
        .map((m) => ({ id: m.id, fullName: memberDisplayName(m) }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    const { data: taskRow } = await supabase
      .from("maintenance_requests")
      .select("id, assigned_to, status, assignee:members!assigned_to(full_name, nickname)")
      .eq("event_id", ev.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (taskRow) {
      const tr = taskRow as unknown as {
        id: string;
        assigned_to: string | null;
        status: string;
        assignee: { full_name: string | null; nickname: string | null } | null;
      };
      shutdownTask = {
        id: tr.id,
        assigneeId: tr.assigned_to,
        assigneeName: tr.assignee ? memberDisplayName(tr.assignee) : null,
        status: tr.status,
      };
    }
  }

  const initial: EventInitialValues = {
    id: ev.id,
    title: ev.title,
    description: ev.description ?? "",
    startAt: toDatetimeLocal(ev.start_at),
    endAt: ev.end_at ? toDatetimeLocal(ev.end_at) : "",
    location: ev.location ?? "",
    areaId: ev.area_id ?? "",
    categoryId: ev.category_id ?? "",
    shutdownProcedureId: ev.shutdown_procedure_id ?? "",
    recurring: ev.recurring ?? false,
    recurFreq: ev.recur_freq === "monthly" ? "monthly" : "weekly",
    recurWeekdays: ev.recur_weekdays ?? [],
    recurMonthlyWeek: ev.recur_monthly_week ?? null,
    recurMonthlyWeekday: ev.recur_monthly_weekday ?? null,
    recurUntil: ev.recur_until ?? "",
    recurExcept: ev.recur_except ?? [],
  };

  return (
    <>
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
          {ev.title}
        </h2>
        <Link
          href="/portal/events"
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
          Back to events
        </Link>
      </div>

      {shutdownProc && ev.recurring && (
        <div style={{ marginTop: 16 }}>
          <div className="rsd-card" style={{ border: "1px solid var(--rsd-accent-line)", background: "var(--rsd-accent-bg)", fontSize: 13, lineHeight: 1.6, color: "var(--gw-fg)" }}>
            <strong>Repeats weekly.</strong> A shutdown task is generated for each occurrence and lands in the{" "}
            <Link href="/portal/tasks" className="rsd-link">Tasks queue</Link>
            {" "}to assign to a team member.
          </div>
        </div>
      )}

      {shutdownProc && !ev.recurring && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <ShutdownAssignment
            eventId={ev.id}
            teamMembers={teamMembers}
            assigneeId={shutdownTask?.assigneeId ?? null}
            assigneeName={shutdownTask?.assigneeName ?? null}
            taskStatus={shutdownTask?.status ?? null}
          />
          <ProcedureRunner
            procedureId={shutdownProc.id}
            title={shutdownProc.title}
            steps={shutdownProc.steps}
            willNotify={shutdownProc.willNotify}
            eventId={ev.id}
            taskId={shutdownTask?.id}
            startLabel="Start shutdown"
          />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <EventForm
          initial={initial}
          areas={areas ?? []}
          categories={categories ?? []}
          shutdownProcedures={shutdownProcedures}
          canDelete={isSuperAdmin(me)}
        />
      </div>
    </>
  );
}

// Format an ISO timestamp into the local-time string that
// <input type="datetime-local"> expects ("YYYY-MM-DDTHH:mm").
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
