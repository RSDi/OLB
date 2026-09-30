import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Icons } from "../../../components/icons";
import { loadMeetings, loadPlanningTasks, sortTasks } from "../../../../lib/planning/data";
import { sortTemplates } from "../../../../lib/planning/logic";
import {
  monthName,
  monthNumber,
  relativeMonth,
  seasonLabel,
  seasonMonths,
  type MonthKey,
} from "../../../../lib/planning/season";
import type { PlanningRole, PlanningTemplate } from "../../../../lib/planning/types";
import { RoleChip } from "./chips";
import { dayNum, monthShort } from "./format";
import { MeetingRow } from "./MeetingRow";
import { buildMonths, loadEvents, occurrencesBetween, type MonthBlock } from "./months";
import { planningHref, RoleFilter } from "./nav";
import { PlanningTaskRow } from "./PlanningTaskRow";
import { SeasonSender } from "./SeasonSender";

// One season on a page, August through July: each month's meeting, tasks and
// events, and the year-round duties. Step back a season to see last year.
export async function YearView({
  supabase,
  season,
  currentSeason,
  current,
  role,
  roles,
  templates,
  builtSeasons,
}: {
  supabase: SupabaseClient;
  season: number;
  currentSeason: number;
  current: MonthKey;
  role: string | null;
  roles: PlanningRole[];
  templates: PlanningTemplate[];
  builtSeasons: Set<number>;
}) {
  const months = seasonMonths(season);
  const from = months[0];
  const to = months[months.length - 1];
  const [events, kept, pending, meetings] = await Promise.all([
    loadEvents(supabase),
    loadPlanningTasks(supabase, ["approved"]),
    loadPlanningTasks(supabase, ["pending_review"]),
    loadMeetings(supabase, from, to),
  ]);

  const roleOrder = new Map(roles.map((r, i) => [r.id, i]));
  const tasks = sortTasks(
    kept.tasks.filter((t) => t.month >= from && t.month <= to && (!role || t.role?.id === role)),
    roleOrder,
  );
  const waiting = pending.tasks.filter((t) => t.season === season).length;
  const blocks = buildMonths(months, occurrencesBetween(events, from, to), tasks, meetings, new Date().getTime());
  const done = tasks.filter((t) => t.status === "done").length;

  const agendaByMonth = new Map<number, number>();
  for (const t of templates) {
    if (t.kind === "agenda" && t.month) agendaByMonth.set(t.month, (agendaByMonth.get(t.month) ?? 0) + 1);
  }
  const yearRound = sortTemplates(
    templates.filter((t) => t.kind === "task" && t.month == null && (!role || t.role_id === role)),
  );
  const roleById = new Map(roles.map((r) => [r.id, r]));
  const built = builtSeasons.has(season);
  const monthlyLines = templates.filter((t) => t.kind === "task" && t.month != null).length;

  const which =
    season === currentSeason
      ? "This season"
      : season === currentSeason - 1
        ? "Last season"
        : season === currentSeason + 1
          ? "Next season"
          : null;

  return (
    <>
      <div data-tour="planning-season" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link
          href={planningHref({ view: "year", season: season - 1, role })}
          className="gw-press"
          style={seasonStep}
          aria-label={`Show ${seasonLabel(season - 1)}`}
        >
          <Icons.ChevronLeft width={14} height={14} /> {seasonLabel(season - 1)}
        </Link>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{seasonLabel(season)} season</h2>
          {which && <span className="rsd-chip rsd-chip-accent">{which}</span>}
        </div>
        <Link
          href={planningHref({ view: "year", season: season + 1, role })}
          className="gw-press"
          style={seasonStep}
          aria-label={`Show ${seasonLabel(season + 1)}`}
        >
          {seasonLabel(season + 1)} <Icons.ChevronRight width={14} height={14} />
        </Link>
        {season !== currentSeason && (
          <Link href={planningHref({ view: "year", role })} style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
            Back to this season
          </Link>
        )}
        {tasks.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
            {done} of {tasks.length} tasks done
          </span>
        )}
      </div>

      <RoleFilter roles={roles} active={role} hrefFor={(r) => planningHref({ view: "year", season, role: r })} />

      {!built && (
        <div className="rsd-card" style={{ gap: 12, padding: "16px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            {seasonLabel(season)} hasn&apos;t been sent to Review yet
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6, maxWidth: 640 }}>
            Sending it copies the template&apos;s {monthlyLines} monthly tasks into Review, where the board keeps or
            tosses each one. What you keep shows up here and on Upcoming.
          </div>
          <SeasonSender seasons={[season]} initial={season} built={[...builtSeasons]} />
        </div>
      )}
      {waiting > 0 && (
        <Link
          href={planningHref({ view: "review", season })}
          className="rsd-card gw-press"
          style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "12px 18px", textDecoration: "none", color: "var(--gw-fg)" }}
        >
          <span className="rsd-chip rsd-chip-warn">{waiting}</span>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
            {waiting === 1 ? "task is" : "tasks are"} waiting in Review for {seasonLabel(season)}
          </span>
          <Icons.ChevronRight width={14} height={14} />
        </Link>
      )}

      <div data-tour="planning-year-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        {blocks.map((b) => (
          <MonthCard
            key={b.key}
            block={b}
            current={current}
            draftTopics={agendaByMonth.get(monthNumber(b.key)) ?? 0}
          />
        ))}
      </div>

      {yearRound.length > 0 && (
        <div className="rsd-card" style={{ gap: 10, padding: "16px 20px" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Year-round</div>
            <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2 }}>
              Duties that run all season, from the template.
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {yearRound.map((t) => (
              <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <RoleChip role={t.role_id ? roleById.get(t.role_id) ?? null : null} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const seasonStep: React.CSSProperties = {
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

function MonthCard({ block, current, draftTopics }: { block: MonthBlock; current: MonthKey; draftTopics: number }) {
  const rel = relativeMonth(block.key, current);
  const isNow = block.key === current;
  const done = block.tasks.filter((t) => t.status === "done").length;
  const [year] = block.key.split("-");
  return (
    <div
      className="rsd-card"
      style={{
        gap: 10,
        padding: "14px 16px",
        borderColor: isNow ? "var(--rsd-accent)" : undefined,
        boxShadow: isNow ? "0 0 0 1px var(--rsd-accent)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <Link
          href={planningHref({ view: block.key < current ? "past" : "upcoming", hash: `m-${block.key}` })}
          style={{ fontSize: 16, fontWeight: 800, color: "var(--gw-fg)", textDecoration: "none" }}
        >
          {monthName(monthNumber(block.key))} <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}>{year}</span>
        </Link>
        {rel && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--rsd-accent)" }}>{rel}</span>}
        {block.tasks.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
            {done}/{block.tasks.length}
          </span>
        )}
      </div>
      <MeetingRow month={block.key} meeting={block.meeting} draftTopics={draftTopics} compact />
      {block.tasks.length > 0 ? (
        <div>
          {block.tasks.map((t) => (
            <PlanningTaskRow key={t.id} task={t} compact />
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>No tasks this month.</div>
      )}
      {(block.events.length > 0 || block.series.length > 0) && (
        <div style={{ borderTop: "1px solid var(--gw-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {block.events.map((o) => (
            <div key={`${o.event.id}-${o.startAt}`} style={{ fontSize: 12, color: "var(--gw-fg)", display: "flex", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "var(--gw-fg-muted)", minWidth: 44 }}>
                {monthShort(o.startAt)} {dayNum(o.startAt)}
              </span>
              <span style={{ fontWeight: 600 }}>{o.event.title}</span>
            </div>
          ))}
          {block.series.map((s) => (
            <div key={s.event.id} style={{ fontSize: 12, color: "var(--gw-fg)", display: "flex", gap: 6 }}>
              <span style={{ fontWeight: 700, color: "var(--gw-fg-muted)", minWidth: 44 }}>↻ {s.count}×</span>
              <span style={{ fontWeight: 600 }}>{s.event.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
