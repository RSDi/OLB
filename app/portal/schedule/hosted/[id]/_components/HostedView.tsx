"use client";
// A tournament we host, planned in one place (0134): how it stands at the
// top (the checklist, teams, games on the courts, the money), then a tab
// each for the Checklist and details, Teams, the court Schedule, Brackets,
// Money (tied to Finances) and Email to the programs coming. Tabs are links
// (?tab=), so each has its own address.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icons } from "../../../../../components/icons";
import { KpiCard } from "../../../../../components/ui";
import { formatWeekdays, formatWeekendDates } from "../../../../../../lib/hs-schedule/logic";
import { moneySummary, overdueSteps, stepProgress } from "../../../../../../lib/hosted/logic";
import type { HostedPageData } from "../../../../../../lib/hosted/types";
import { money } from "./parts";
import { PlanPanel } from "./PlanPanel";
import { TeamsPanel } from "./TeamsPanel";
import { SchedulePanel } from "./SchedulePanel";
import { BracketsPanel } from "./BracketsPanel";
import { MoneyPanel } from "./MoneyPanel";
import { MessagesPanel } from "./MessagesPanel";

export type HostedTab = "plan" | "teams" | "schedule" | "brackets" | "money" | "messages";

const TABS: { key: HostedTab; label: string }[] = [
  { key: "plan", label: "Checklist" },
  { key: "teams", label: "Teams" },
  { key: "schedule", label: "Schedule" },
  { key: "brackets", label: "Brackets" },
  { key: "money", label: "Money" },
  { key: "messages", label: "Email" },
];

export function HostedView({ data, tab, today }: { data: HostedPageData; tab: HostedTab; today: string }) {
  const { weekend, plan, steps, teams, games } = data;
  const base = `/portal/schedule/hosted/${weekend.id}`;
  const progress = stepProgress(steps);
  const late = overdueSteps(steps, today).length;
  const placed = games.filter((g) => g.plays_on && g.starts_at && g.court).length;
  const sum = moneySummary(plan, teams, data.money, games);
  const meta = [formatWeekdays(weekend.starts_on, weekend.ends_on), weekend.location, data.facilityName].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/portal/schedule" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none", display: "inline-flex", gap: 4, alignItems: "center" }}>
          <Icons.ChevronLeft width={13} height={13} /> HS Schedule
        </Link>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, lineHeight: 1.15 }}>{weekend.event || "Our tournament"}</h1>
          {plan.short_name && (
            <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 8px", borderRadius: 6, background: "var(--rsd-accent-bg)", color: "var(--gw-fg)" }}>
              {plan.short_name}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          {formatWeekendDates(weekend.starts_on, weekend.ends_on)}
          {meta && ` · ${meta}`}
        </div>
      </div>

      <div className="rsd-kpi-grid" data-tour="hosted-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 32px)" } as React.CSSProperties}>
        <KpiCard
          label="Checklist"
          value={`${progress.done} of ${progress.total}`}
          sub={late ? `${late} past due` : progress.total && progress.done === progress.total ? "All done" : "Done"}
          accent={late > 0}
          href={base}
        />
        <KpiCard label="Teams" value={String(teams.length)} sub={`${data.divisions.length} ${data.divisions.length === 1 ? "division" : "divisions"}`} href={`${base}?tab=teams`} />
        <KpiCard label="Games" value={String(games.length)} sub={games.length ? `${placed} on the courts` : "None yet"} href={`${base}?tab=schedule`} />
        <KpiCard label="Net (estimate)" value={money(sum.net)} sub={`${money(sum.revenue)} in · ${money(sum.expense)} out`} href={`${base}?tab=money`} />
      </div>

      <HostedTabs base={base} active={tab} />

      {tab === "plan" && <PlanPanel data={data} today={today} />}
      {tab === "teams" && <TeamsPanel data={data} />}
      {tab === "schedule" && <SchedulePanel data={data} />}
      {tab === "brackets" && <BracketsPanel data={data} />}
      {tab === "money" && <MoneyPanel data={data} />}
      {tab === "messages" && <MessagesPanel data={data} />}
    </div>
  );
}

function HostedTabs({ base, active }: { base: string; active: HostedTab }) {
  // On a phone the tabs scroll sideways: keep the open one in view.
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav aria-label="Tournament" data-tour="hosted-tabs" style={{ display: "flex", gap: 4, overflowX: "auto", borderBottom: "1px solid var(--gw-border)" }}>
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === "plan" ? base : `${base}?tab=${t.key}`}
          ref={t.key === active ? current : undefined}
          aria-current={t.key === active ? "page" : undefined}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
            whiteSpace: "nowrap",
            textDecoration: "none",
            color: t.key === active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
            borderBottom: `2px solid ${t.key === active ? "var(--rsd-accent)" : "transparent"}`,
            marginBottom: -1,
          }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
