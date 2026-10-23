"use client";
import { useId, useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { KpiCard, Pill } from "../../components/ui";
import { formatAmount, formatDollars } from "../../../lib/finances/logic";
import { snapshotCsv, type Snapshot, type Spend } from "../../../lib/finances/club-logic";
import { SpendBar, sub } from "./club-parts";

type SectionId = "in" | "groups" | "teams" | "programs" | "events" | "fundraising" | "families";

// Payments → Snapshot (0131): the club's money at a glance, for the board,
// coaches given "See club finances", and the Treasurer. Totals only: no
// family names or balances.
//
// Each section starts collapsed. The header shows the name and its total:
//   Money in — snapshot.moneyIn.total
//   Spending vs budget — snapshot.budget.spend (paid of budget + bar)
//   Teams — derived: sum of each team's spend (bar when any team is budgeted)
//   Clinics and workouts — derived: sum of (billed − costs.paid); bar when
//     any program has a cost budget (aggregated program costs)
//   Tournaments we host — derived: sum of (income − spend.paid); bar when
//     any event has a cost budget (aggregated event costs)
//   Fundraising and funds — snapshot.moneyIn.fundraising when there are
//     fundraisers (same figure as Money in); otherwise the sum of fund totals.
//     Not the sum of every listed row: fund totals already include money that
//     fundraiser rows send to funds.
//   Families — snapshot.families.owed
export function SnapshotView({ snapshot: s }: { snapshot: Snapshot }) {
  const uid = useId();
  const visible = useMemo(() => visibleSectionIds(s), [s]);
  const [open, setOpen] = useState<ReadonlySet<SectionId>>(() => new Set());
  const allOpen = visible.length > 0 && visible.every((id) => open.has(id));

  function toggle(id: SectionId) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function download() {
    const blob = new Blob([snapshotCsv(s)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `club-finances-${s.season}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const teamsSpend = sumSpend(s.teams.map((t) => t.spend));
  const programsNet = s.programs.reduce((n, p) => n + (p.totals.billed - p.totals.costs.paid), 0);
  const programsCosts = sumSpend(s.programs.map((p) => p.totals.costs));
  const eventsNet = s.events.reduce((n, e) => n + (e.income - e.spend.paid), 0);
  const eventsSpend = sumSpend(s.events.map((e) => e.spend));
  const fundsTotal = s.funds.reduce((n, f) => n + f.total, 0);
  const fundraisingHeader = s.fundraisers.length > 0 ? s.moneyIn.fundraising : fundsTotal;
  const printedOn = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

  return (
    <div className="fin-snapshot" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="fin-snapshot-print-only" aria-hidden>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#555" }}>Omaha Lightning Basketball</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>Finance Snapshot</div>
        <div style={{ fontSize: 13, marginTop: 4 }} suppressHydrationWarning>
          {printedOn}
          {s.season ? ` · ${s.season} season` : ""}
        </div>
      </div>

      <div className="rsd-kpi-grid" data-tour="snapshot-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}>
        <KpiCard label="Money in" value={formatDollars(s.moneyIn.total)} sub={`${s.season} season`} />
        <KpiCard label="Money out" value={formatDollars(s.moneyOut)} sub={s.budget.spend.budget ? `Budget ${formatDollars(s.budget.spend.budget)}` : "No budget yet"} />
        <KpiCard label={s.net >= 0 ? "Ahead" : "Behind"} value={formatDollars(Math.abs(s.net))} sub="In minus out" accent={s.net < 0} />
        <KpiCard label="Families still owe" value={formatDollars(s.families.owed)} sub={`${s.families.owing} ${s.families.owing === 1 ? "family" : "families"}`} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <p className="fin-snapshot-no-print" style={{ ...sub, maxWidth: 560 }}>
          Live from Payments: families&apos; payments, the budget, income and fundraising, as of right now.
        </p>
        <span className="fin-snapshot-no-print" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span data-tour="snapshot-expand-all">
            <Pill size="sm" variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(visible))}>
              {allOpen ? "Collapse all" : "Expand all"}
            </Pill>
          </span>
          <span data-tour="snapshot-print">
            <Pill size="sm" variant="ghost" onClick={() => window.print()}>
              <Icons.Printer width={13} height={13} /> Print / PDF
            </Pill>
          </span>
          <span data-tour="snapshot-download">
            <Pill size="sm" variant="ghost" onClick={download}>
              <Icons.Download width={13} height={13} /> Download spreadsheet
            </Pill>
          </span>
        </span>
      </div>

      <Section
        id={`${uid}-in`}
        title="Money in"
        data-tour="snapshot-in"
        expanded={open.has("in")}
        onToggle={() => toggle("in")}
        summary={<MoneyTotal cents={s.moneyIn.total} />}
      >
        <Row label="Families' payments" value={s.moneyIn.families} />
        <Row label="Clinic and workout sign-ups" value={s.moneyIn.programs} />
        <Row label="Donations, sponsors and events" value={s.moneyIn.income} note={s.budget.incomeExpected ? `${formatAmount(s.budget.incomeExpected)} expected` : undefined} />
        <Row label="Fundraising" value={s.moneyIn.fundraising} />
        <Row label="Total" value={s.moneyIn.total} strong />
      </Section>

      {s.groups.length > 0 && (
        <Section
          id={`${uid}-groups`}
          title="Spending vs budget"
          data-tour="snapshot-groups"
          expanded={open.has("groups")}
          onToggle={() => toggle("groups")}
          summary={<BudgetSummary spend={s.budget.spend} />}
        >
          {s.groups.map((g) => (
            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</span>
              <SpendBar spend={g.spend} />
            </div>
          ))}
        </Section>
      )}

      {s.teams.length > 0 && (
        <Section
          id={`${uid}-teams`}
          title="Teams"
          expanded={open.has("teams")}
          onToggle={() => toggle("teams")}
          summary={<BudgetSummary spend={teamsSpend} fallback={teamsSpend.paid} />}
        >
          {s.teams.map((t) => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                {t.passedOn > 0 && <span style={sub}>{formatAmount(t.passedOn)} passed on to families</span>}
              </span>
              <SpendBar spend={t.spend} compact />
            </div>
          ))}
        </Section>
      )}

      {s.programs.length > 0 && (
        <Section
          id={`${uid}-programs`}
          title="Clinics and workouts"
          expanded={open.has("programs")}
          onToggle={() => toggle("programs")}
          summary={<BudgetSummary spend={programsCosts} fallback={programsNet} />}
        >
          {s.programs.map((p) => (
            <Row
              key={p.name}
              label={p.name}
              value={p.totals.billed - p.totals.costs.paid}
              note={`${p.totals.signups} signed up · ${formatAmount(p.totals.billed)} in fees · ${formatAmount(p.totals.costs.paid)} costs`}
            />
          ))}
        </Section>
      )}

      {s.events.length > 0 && (
        <Section
          id={`${uid}-events`}
          title="Tournaments we host"
          expanded={open.has("events")}
          onToggle={() => toggle("events")}
          summary={<BudgetSummary spend={eventsSpend} fallback={eventsNet} />}
        >
          {s.events.map((e) => (
            <Row key={e.name} label={e.name} value={e.income - e.spend.paid} note={`${formatAmount(e.income)} in · ${formatAmount(e.spend.paid)} out${e.expected ? ` · ${formatAmount(e.expected)} expected in` : ""}`} />
          ))}
        </Section>
      )}

      {(s.fundraisers.length > 0 || s.funds.length > 0) && (
        <Section
          id={`${uid}-fundraising`}
          title="Fundraising and funds"
          expanded={open.has("fundraising")}
          onToggle={() => toggle("fundraising")}
          summary={<MoneyTotal cents={fundraisingHeader} />}
        >
          {s.fundraisers.map((f) => (
            <Row key={f.name} label={f.name} value={f.toFamilies + f.toFunds} note={`${formatAmount(f.toFamilies)} toward families' fees · ${formatAmount(f.toFunds)} to funds`} />
          ))}
          {s.funds.map((f) => (
            <Row key={f.name} label={f.name} value={f.total} note="The fund's total" />
          ))}
        </Section>
      )}

      <Section
        id={`${uid}-families`}
        title="Families"
        expanded={open.has("families")}
        onToggle={() => toggle("families")}
        summary={<MoneyTotal cents={s.families.owed} />}
      >
        <Row label="Charged" value={s.families.charged} />
        <Row
          label="Taken off"
          value={s.families.credited}
          note={[s.families.fundraisingCredits && `${formatAmount(s.families.fundraisingCredits)} fundraising`, s.families.coachComps && `${formatAmount(s.families.coachComps)} coaches' kids`].filter(Boolean).join(" · ") || undefined}
        />
        <Row label="Paid" value={s.families.paid} />
        <Row label="Still owed" value={s.families.owed} strong />
      </Section>
    </div>
  );
}

function visibleSectionIds(s: Snapshot): SectionId[] {
  const ids: SectionId[] = ["in"];
  if (s.groups.length > 0) ids.push("groups");
  if (s.teams.length > 0) ids.push("teams");
  if (s.programs.length > 0) ids.push("programs");
  if (s.events.length > 0) ids.push("events");
  if (s.fundraisers.length > 0 || s.funds.length > 0) ids.push("fundraising");
  ids.push("families");
  return ids;
}

function sumSpend(items: Spend[]): Spend {
  return items.reduce((t, s) => ({ budget: t.budget + s.budget, paid: t.paid + s.paid }), { budget: 0, paid: 0 });
}

function MoneyTotal({ cents }: { cents: number }) {
  return (
    <span style={{ fontSize: 13.5, fontWeight: 800, whiteSpace: "nowrap", color: cents < 0 ? "var(--gw-error)" : undefined }}>
      {cents < 0 ? `−${formatAmount(-cents)}` : formatAmount(cents)}
    </span>
  );
}

// Budgeted sections: "$X of $Y" plus the existing bar. When nothing is
// budgeted, show the fallback total (or paid) so the header still has a figure.
function BudgetSummary({ spend, fallback }: { spend: Spend; fallback?: number }) {
  if (spend.budget > 0) return <SpendBar spend={spend} compact />;
  return <MoneyTotal cents={fallback ?? spend.paid} />;
}

function Section({
  id,
  title,
  expanded,
  onToggle,
  summary,
  children,
  ...rest
}: {
  id: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  summary: React.ReactNode;
  children: React.ReactNode;
  "data-tour"?: string;
}) {
  const panelId = `${id}-panel`;
  return (
    <div className="rsd-card fin-snapshot-section" style={{ gap: 10, padding: "16px 18px" }} data-tour={rest["data-tour"]}>
      <button
        type="button"
        id={`${id}-toggle`}
        className="fin-snapshot-section-toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          width: "100%",
          minHeight: 44,
          margin: 0,
          border: "none",
          background: "none",
          padding: 0,
          textAlign: "left",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span
            className="fin-snapshot-chevron"
            aria-hidden
            style={{ fontSize: 11, color: "var(--gw-fg-muted)", transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "none", flexShrink: 0 }}
          >
            ▶
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{title}</h3>
        </span>
        <span className="fin-snapshot-section-summary">{summary}</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={`${id}-toggle`}
        aria-hidden={!expanded}
        className="fin-snapshot-section-body"
        style={{ display: expanded ? "flex" : "none", flexDirection: "column", gap: 10 }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, note, strong }: { label: string; value: number; note?: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", ...(strong ? { borderTop: "1px solid var(--gw-border)", paddingTop: 8 } : {}) }}>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: strong ? 800 : 600 }}>{label}</span>
        {note && <span style={sub}>{note}</span>}
      </span>
      <span style={{ fontSize: 13.5, fontWeight: strong ? 800 : 700, whiteSpace: "nowrap", color: value < 0 ? "var(--gw-error)" : undefined }}>
        {value < 0 ? `−${formatAmount(-value)}` : formatAmount(value)}
      </span>
    </div>
  );
}
