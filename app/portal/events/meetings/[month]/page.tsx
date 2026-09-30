import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { churchToday } from "../../../../../lib/dates/today";
import { canUsePlanning } from "../../../../../lib/planning/access";
import {
  loadMeetings,
  loadPlanningRoles,
  loadPlanningTasks,
  loadPlanningTemplates,
  sortTasks,
} from "../../../../../lib/planning/data";
import { agendaDraft, parseMonthParam } from "../../../../../lib/planning/logic";
import {
  addMonths,
  monthKeyOf,
  monthLabel,
  monthName,
  monthNumber,
  relativeMonth,
  seasonLabel,
  seasonOfMonth,
} from "../../../../../lib/planning/season";
import { MigrationNotice } from "../../_planning/nav";
import { MeetingForm } from "./MeetingForm";

// One month's board meeting (Planning → a month's "Board meeting" row).
// Every month has one; the row is saved the first time someone presses Save.
export default async function MeetingPage({ params }: { params: Promise<{ month: string }> }) {
  const { month: raw } = await params;
  const month = parseMonthParam(raw);
  if (!month) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!canUsePlanning(viewer)) redirect("/portal/events");

  const supabase = await createClient();
  const season = seasonOfMonth(month);
  const current = monthKeyOf(churchToday());
  const [meetings, tpl, rolesRes, kept] = await Promise.all([
    loadMeetings(supabase, month, month),
    loadPlanningTemplates(supabase),
    loadPlanningRoles(supabase),
    loadPlanningTasks(supabase, ["approved"]),
  ]);
  const meeting = meetings.get(month) ?? null;

  // What this meeting said about each task.
  const notes: Record<string, string> = {};
  if (meeting) {
    const { data } = await supabase
      .from("planning_meeting_notes")
      .select("task_id, note_md")
      .eq("meeting_id", meeting.id);
    for (const n of (data as { task_id: string; note_md: string }[] | null) ?? []) notes[n.task_id] = n.note_md;
  }

  const roleOrder = new Map(rolesRes.roles.map((r, i) => [r.id, i]));
  const tasks = sortTasks(kept.tasks, roleOrder);
  const thisMonth = tasks.filter((t) => t.month === month);
  // Earlier this season and not finished, plus anything this meeting already
  // has a note on (so a note never hides).
  const earlier = tasks.filter(
    (t) =>
      t.season === season &&
      t.month < month &&
      ((t.status !== "done" && t.status !== "cancelled") || notes[t.id] !== undefined),
  );

  const rel = relativeMonth(month, current);
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Link
          href={`/portal/events?view=year&season=${season}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
        >
          <Icons.ChevronLeft width={14} height={14} /> {seasonLabel(season)} season
        </Link>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <Link href={`/portal/events/meetings/${prev}`} style={stepStyle} aria-label={`${monthLabel(prev)} meeting`}>
            <Icons.ChevronLeft width={14} height={14} /> {monthName(monthNumber(prev), true)}
          </Link>
          <Link href={`/portal/events/meetings/${next}`} style={stepStyle} aria-label={`${monthLabel(next)} meeting`}>
            {monthName(monthNumber(next), true)} <Icons.ChevronRight width={14} height={14} />
          </Link>
        </span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{monthLabel(month)} board meeting</h2>
          {rel && <span className="rsd-chip rsd-chip-accent">{rel}</span>}
        </div>
      </div>

      {!tpl.ok ? (
        <MigrationNotice />
      ) : (
        <MeetingForm
          key={meeting?.id ?? month}
          month={month}
          saved={meeting !== null}
          initial={{
            meetsOn: meeting?.meets_on ?? "",
            status: meeting?.status ?? "planned",
            agendaMd: meeting ? meeting.agenda_md : agendaDraft(tpl.templates, monthNumber(month)),
            minutesMd: meeting?.minutes_md ?? "",
            notes,
          }}
          thisMonth={thisMonth}
          earlier={earlier}
        />
      )}
    </>
  );
}

const stepStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 12px",
  borderRadius: 100,
  border: "1px solid var(--gw-border)",
  fontSize: 12,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  textDecoration: "none",
};
