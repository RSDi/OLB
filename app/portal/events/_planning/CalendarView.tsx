import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Icons } from "../../../components/icons";
import { recurrenceSummary } from "../../../../lib/events/recurrence";
import { earliestPlanningMonth, loadMeetings, loadPlanningTasks, sortTasks } from "../../../../lib/planning/data";
import {
  SEASON_START_MONTH,
  monthLabel,
  monthNumber,
  monthsBetween,
  relativeMonth,
  seasonLabel,
  seasonMonth,
  seasonOfMonth,
  type MonthKey,
} from "../../../../lib/planning/season";
import type { PlanningRole, PlanningTemplate } from "../../../../lib/planning/types";
import { MeetingRow } from "./MeetingRow";
import { PlanningTaskRow } from "./PlanningTaskRow";
import { churchYmd, dayNum, formatPlainDate, formatTimeRange, monthShort, timeOnly } from "./format";
import {
  buildMonths,
  calendarRange,
  eventMonths,
  loadEvents,
  occurrencesBetween,
  type MonthBlock,
  type Occurrence,
  type SeriesInMonth,
} from "./months";
import { LinkSelect } from "./LinkSelect";
import { FilterRow, planningHref, RoleFilter, type PlanningView } from "./nav";

const monthHeaderStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "var(--gw-bg)",
  borderBottom: "1px solid var(--gw-border)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".06em",
  color: "var(--gw-fg-muted)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  scrollMarginTop: 80,
};

const subLabelStyle: React.CSSProperties = {
  padding: "10px 18px 0",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--gw-fg-faint)",
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

// Upcoming (this month onward), Past (last month backward) and All, month by
// month. The board (planner) also sees each month's board meeting and kept
// tasks; everyone else sees the events.
export async function CalendarView({
  supabase,
  view,
  planner,
  staff,
  role,
  roles,
  templates,
  current,
}: {
  supabase: SupabaseClient;
  view: Extract<PlanningView, "upcoming" | "past" | "all">;
  planner: boolean;
  staff: boolean;
  role: string | null;
  roles: PlanningRole[];
  templates: PlanningTemplate[];
  current: MonthKey;
}) {
  const nowMs = new Date().getTime();
  const [events, taskRes, earliest] = await Promise.all([
    loadEvents(supabase),
    planner ? loadPlanningTasks(supabase, ["approved"]) : Promise.resolve({ ok: true, tasks: [] }),
    planner ? earliestPlanningMonth(supabase) : Promise.resolve(null),
  ]);

  const roleOrder = new Map(roles.map((r, i) => [r.id, i]));
  const tasks = sortTasks(
    taskRes.tasks.filter((t) => !role || t.role?.id === role),
    roleOrder,
  );

  const seasonFirst = seasonMonth(seasonOfMonth(current), SEASON_START_MONTH);
  const dataMonths = [...eventMonths(events), ...taskRes.tasks.map((t) => t.month), ...(earliest ? [earliest] : [])];
  const range = calendarRange(current, seasonFirst, dataMonths);
  const from = view === "upcoming" ? range.upFrom : range.pastFrom;
  const to = view === "past" ? range.pastTo : range.upTo;
  let months = monthsBetween(from, to);
  if (view === "past") months = months.reverse();

  const meetings = planner && months.length > 0 ? await loadMeetings(supabase, from, to) : new Map();
  let blocks = buildMonths(months, occurrencesBetween(events, from, to), tasks, meetings, nowMs);
  // Everyone else only needs months with something in them.
  if (!planner) blocks = blocks.filter((b) => b.events.length > 0 || b.series.length > 0);

  const agendaByMonth = new Map<number, number>();
  for (const t of templates) {
    if (t.kind === "agenda" && t.month) agendaByMonth.set(t.month, (agendaByMonth.get(t.month) ?? 0) + 1);
  }
  const taskTotal = blocks.reduce((n, b) => n + b.tasks.length, 0);
  const eventTotal = blocks.reduce((n, b) => n + b.events.length + b.series.length, 0);

  return (
    <>
      <FilterRow>
        <LinkSelect
          label="Which months"
          data-tour="planning-when"
          value={view}
          active={view !== "upcoming"}
          options={[
            { value: "upcoming", label: "Upcoming", href: planningHref({ view: "upcoming", role }) },
            { value: "past", label: "Past", href: planningHref({ view: "past", role }) },
            { value: "all", label: "All months", href: planningHref({ view: "all", role }) },
          ]}
        />
        {planner && <RoleFilter roles={roles} active={role} hrefFor={(r) => planningHref({ view, role: r })} />}
      </FilterRow>
      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--gw-border)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {planner
              ? `${taskTotal} ${taskTotal === 1 ? "task" : "tasks"} · ${eventTotal} ${eventTotal === 1 ? "event" : "events"}`
              : `${eventTotal} ${eventTotal === 1 ? "event" : "events"}`}
          </h3>
          {view === "all" && blocks.some((b) => b.key === current) && (
            <a href={`#m-${current}`} style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", textDecoration: "none" }}>
              Jump to this month
            </a>
          )}
        </div>
        {blocks.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              {view === "upcoming" ? "Nothing coming up" : view === "past" ? "Nothing before this month yet" : "Nothing here yet"}
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              {staff ? "Click + New event to add one." : "Check back later. The board adds events here."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {blocks.map((b, i) => (
              <MonthSection
                key={b.key}
                block={b}
                current={current}
                planner={planner}
                staff={staff}
                draftTopics={agendaByMonth.get(monthNumber(b.key)) ?? 0}
                showSeason={monthNumber(b.key) === SEASON_START_MONTH || i === 0}
                nowMs={nowMs}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function MonthSection({
  block,
  current,
  planner,
  staff,
  draftTopics,
  showSeason,
  nowMs,
}: {
  block: MonthBlock;
  current: MonthKey;
  planner: boolean;
  staff: boolean;
  draftTopics: number;
  showSeason: boolean;
  nowMs: number;
}) {
  const rel = relativeMonth(block.key, current);
  const done = block.tasks.filter((t) => t.status === "done").length;
  const hasEvents = block.events.length > 0 || block.series.length > 0;
  return (
    <section id={`m-${block.key}`} data-tour="planning-month" style={{ scrollMarginTop: 80 }}>
      <div style={monthHeaderStyle}>
        {rel && <span style={{ color: "var(--rsd-accent)" }}>{rel} ·</span>}
        <span>{monthLabel(block.key)}</span>
        {planner && showSeason && (
          <span className="rsd-chip rsd-chip-mute" style={{ textTransform: "none", letterSpacing: 0 }}>
            {seasonLabel(seasonOfMonth(block.key))} season
          </span>
        )}
        {planner && block.tasks.length > 0 && (
          <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
            {done} of {block.tasks.length} done
          </span>
        )}
      </div>
      {planner && <MeetingRow month={block.key} meeting={block.meeting} draftTopics={draftTopics} />}
      {hasEvents && (
        <div>
          {planner && <div style={subLabelStyle}>Events</div>}
          {block.events.map((o) => (
            <EventLine key={`${o.event.id}-${o.startAt}`} occ={o} staff={staff} past={new Date(o.startAt).getTime() < nowMs} />
          ))}
          {block.series.map((s) => (
            <SeriesLine key={s.event.id} series={s} staff={staff} />
          ))}
        </div>
      )}
      {planner && block.tasks.length > 0 && (
        <div style={{ paddingBottom: 6, borderBottom: "1px solid var(--gw-border)" }}>
          <div style={subLabelStyle}>To do</div>
          {block.tasks.map((t) => (
            <PlanningTaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
      {planner && !hasEvents && block.tasks.length === 0 && (
        <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--gw-fg-muted)", borderBottom: "1px solid var(--gw-border)" }}>
          Nothing else planned this month.
        </div>
      )}
    </section>
  );
}

function DateChip({ iso, chipClass }: { iso: string; chipClass: string }) {
  return (
    <div
      className={`rsd-chip ${chipClass}`}
      style={{ width: 56, flexShrink: 0, textAlign: "center", padding: "6px 0", borderRadius: 10, display: "block" }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
        {monthShort(iso)}
      </div>
      <div
        style={{
          fontFamily: "var(--rsd-display)",
          fontSize: "calc(18px * var(--rsd-display-scale))",
          fontWeight: 800,
          lineHeight: 1.1,
          marginTop: 2,
        }}
      >
        {dayNum(iso)}
      </div>
    </div>
  );
}

function EditLink({ id }: { id: string }) {
  return (
    <Link
      href={`/portal/events/${id}/edit`}
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: "var(--rsd-accent)",
        textDecoration: "none",
        padding: "6px 10px",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      Edit <Icons.ChevronRight width={12} height={12} />
    </Link>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 14,
  padding: "14px 18px",
  borderBottom: "1px solid var(--gw-border)",
  alignItems: "center",
  flexWrap: "wrap",
};

function EventLine({ occ, staff, past }: { occ: Occurrence; staff: boolean; past: boolean }) {
  const event = occ.event;
  const chipClass = event.category?.chip_class ?? "rsd-chip-mute";
  const where = event.area?.name ?? event.location ?? null;
  return (
    <div style={{ ...rowStyle, opacity: past ? 0.6 : 1 }}>
      <DateChip iso={occ.startAt} chipClass={chipClass} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{event.title}</span>
          {event.category && <span className={`rsd-chip ${chipClass}`}>{event.category.name}</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{formatTimeRange(occ.startAt, occ.endAt)}</span>
          {where && (
            <>
              <span>·</span>
              <span>{where}</span>
            </>
          )}
        </div>
        {event.description && (
          <div style={{ fontSize: 13, color: "var(--gw-fg)", fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>
            {event.description}
          </div>
        )}
      </div>
      {staff && <EditLink id={event.id} />}
    </div>
  );
}

// A repeating event, once per month: how often, when, and the next one.
function SeriesLine({ series, staff }: { series: SeriesInMonth; staff: boolean }) {
  const event = series.event;
  const chipClass = event.category?.chip_class ?? "rsd-chip-mute";
  const where = event.area?.name ?? event.location ?? null;
  const next = series.next;
  return (
    <div style={rowStyle}>
      <div
        className={`rsd-chip ${chipClass}`}
        style={{
          width: 56,
          flexShrink: 0,
          textAlign: "center",
          padding: "6px 0",
          borderRadius: 10,
          display: "block",
        }}
        title={recurrenceSummary(event) ?? "Repeats"}
      >
        <div style={{ fontSize: 18, lineHeight: 1.1, fontWeight: 800 }}>↻</div>
        <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>{series.count}×</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{event.title}</span>
          {event.category && <span className={`rsd-chip ${chipClass}`}>{event.category.name}</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>{recurrenceSummary(event) ?? "Repeats"}</span>
          <span>·</span>
          <span>
            {timeOnly(series.first.startAt)}
            {series.first.endAt ? ` – ${timeOnly(series.first.endAt)}` : ""}
          </span>
          <span>·</span>
          <span>
            {series.count} {series.count === 1 ? "time" : "times"} this month
          </span>
          {next && next !== series.first && (
            <>
              <span>·</span>
              <span>next {formatPlainDate(churchYmd(next.startAt))}</span>
            </>
          )}
          {where && (
            <>
              <span>·</span>
              <span>{where}</span>
            </>
          )}
        </div>
      </div>
      {staff && <EditLink id={event.id} />}
    </div>
  );
}
