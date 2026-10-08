import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/server";
import { getViewer } from "../../../lib/auth/viewer";
import { churchToday } from "../../../lib/dates/today";
import { canUsePlanning } from "../../../lib/planning/access";
import {
  countPendingPlanningTasks,
  loadBuiltSeasons,
  loadPlanningRoles,
  loadPlanningTemplates,
  loadPlaybookOptions,
} from "../../../lib/planning/data";
import { parseSeasonParam } from "../../../lib/planning/logic";
import { monthKeyOf, seasonOfMonth } from "../../../lib/planning/season";
import type { PlanningRole, PlanningTemplate } from "../../../lib/planning/types";
import { CalendarView } from "./_planning/CalendarView";
import { MigrationNotice, parseView, PlanningTabs } from "./_planning/nav";
import { parseShow, ReviewView } from "./_planning/ReviewView";
import { TemplateEditor } from "./_planning/TemplateEditor";
import { YearView } from "./_planning/YearView";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Planning (was Events): the calendar month by month. The board also gets each
// month's board meeting and the tasks it kept from the yearly template, a Year
// view per season, Review (keep or toss a season's tasks) and the Template
// itself. Everyone else sees the events.
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; season?: string; role?: string; show?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const planner = canUsePlanning(viewer);
  const staff = viewer.isStaff;
  const view = parseView(params.view, planner);
  const role = planner && params.role && UUID.test(params.role) ? params.role : null;

  const supabase = await createClient();
  const current = monthKeyOf(churchToday());
  const currentSeason = seasonOfMonth(current);

  let roles: PlanningRole[] = [];
  let templates: PlanningTemplate[] = [];
  let pendingCount = 0;
  let ready = true;
  let builtSeasons = new Set<number>();
  if (planner) {
    const [r, t, p, b] = await Promise.all([
      loadPlanningRoles(supabase),
      loadPlanningTemplates(supabase),
      countPendingPlanningTasks(supabase),
      loadBuiltSeasons(supabase),
    ]);
    ready = r.ok && t.ok;
    roles = r.roles;
    templates = t.templates;
    pendingCount = p;
    builtSeasons = b;
  }
  // Before migration 0104 only the events work.
  const effectiveView = ready ? view : parseView(view, false);

  return (
    <>
      {(planner && ready) || staff ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          {planner && ready ? <PlanningTabs view={effectiveView} role={role} pendingCount={pendingCount} /> : <span />}
          {staff && (
            <Link
              href="/portal/events/new"
              className="gw-press"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 100,
                border: "1px solid var(--rsd-accent-fill)",
                background: "var(--rsd-accent-fill)",
                color: "var(--rsd-accent-fill-on)",
                fontSize: 12,
                fontWeight: 700,
                lineHeight: 1,
                whiteSpace: "nowrap",
                textDecoration: "none",
              }}
            >
              <Icons.Plus width={13} height={13} />
              New event
            </Link>
          )}
        </div>
      ) : null}

      {planner && !ready && <MigrationNotice />}

      {(effectiveView === "upcoming" || effectiveView === "past" || effectiveView === "all") && (
        <CalendarView
          supabase={supabase}
          view={effectiveView}
          planner={planner && ready}
          staff={staff}
          role={role}
          roles={roles}
          templates={templates}
          current={current}
        />
      )}
      {effectiveView === "year" && (
        <YearView
          supabase={supabase}
          season={parseSeasonParam(params.season) ?? currentSeason}
          currentSeason={currentSeason}
          current={current}
          role={role}
          roles={roles}
          templates={templates}
          builtSeasons={builtSeasons}
        />
      )}
      {effectiveView === "review" && (
        <ReviewView
          supabase={supabase}
          season={parseSeasonParam(params.season)}
          show={parseShow(params.show)}
          role={role}
          roles={roles}
          currentSeason={currentSeason}
          builtSeasons={builtSeasons}
        />
      )}
      {effectiveView === "template" && (
        <TemplateEditor templates={templates} roles={roles} playbooks={await loadPlaybookOptions(supabase)} />
      )}
    </>
  );
}
