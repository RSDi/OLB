import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { churchToday } from "../../../../../lib/dates/today";
import { canUsePlanning } from "../../../../../lib/planning/access";
import {
  loadMeetingState,
  loadPlanningRoles,
  namesForUsers,
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

const THIS_MONTH = "this-month";

// One month's board meeting (Planning → a month's "Board meeting" row).
// Every month has one; the row is saved the first time someone presses Save.
// /portal/events/meetings/this-month is always the current month's, a fixed
// address for bookmarks and the Planning guided tour (lib/help/tours.ts).
export default async function MeetingPage({ params }: { params: Promise<{ month: string }> }) {
  const { month: raw } = await params;
  const current = monthKeyOf(churchToday());
  const month = raw === THIS_MONTH ? current : parseMonthParam(raw);
  if (!month) notFound();

  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!canUsePlanning(viewer)) redirect("/portal/events");

  const supabase = await createClient();
  const season = seasonOfMonth(month);
  const [tpl, rolesRes, kept] = await Promise.all([
    loadPlanningTemplates(supabase),
    loadPlanningRoles(supabase),
    loadPlanningTasks(supabase, ["approved"]),
  ]);
  const [{ ok: historyReady, state }, names] = await Promise.all([
    loadMeetingState(supabase, month),
    namesForUsers(supabase, [viewer.userId]),
  ]);
  const notes = state.snapshot.notes;

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

      {!tpl.ok || !historyReady ? (
        <MigrationNotice />
      ) : (
        <MeetingForm
          month={month}
          server={state}
          draftAgenda={agendaDraft(tpl.templates, monthNumber(month))}
          thisMonth={thisMonth}
          earlier={earlier}
          me={{ userId: viewer.userId, name: names.get(viewer.userId) ?? "A board member" }}
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
