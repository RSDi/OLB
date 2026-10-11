"use client";
import { Icons } from "../../components/icons";
import { KpiCard, Pill } from "../../components/ui";
import { formatAmount, formatDollars } from "../../../lib/finances/logic";
import { snapshotCsv, type Snapshot } from "../../../lib/finances/club-logic";
import { SpendBar, sub } from "./club-parts";

// Payments → Snapshot (0131): the club's money at a glance, for the board,
// coaches given "See club finances", and the Treasurer. Totals only: no
// family names or balances.
export function SnapshotView({ snapshot: s }: { snapshot: Snapshot }) {
  function download() {
    const blob = new Blob([snapshotCsv(s)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `club-finances-${s.season}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rsd-kpi-grid" data-tour="snapshot-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}>
        <KpiCard label="Money in" value={formatDollars(s.moneyIn.total)} sub={`${s.season} season`} />
        <KpiCard label="Money out" value={formatDollars(s.moneyOut)} sub={s.budget.spend.budget ? `Budget ${formatDollars(s.budget.spend.budget)}` : "No budget yet"} />
        <KpiCard label={s.net >= 0 ? "Ahead" : "Behind"} value={formatDollars(Math.abs(s.net))} sub="In minus out" accent={s.net < 0} />
        <KpiCard label="Families still owe" value={formatDollars(s.families.owed)} sub={`${s.families.owing} ${s.families.owing === 1 ? "family" : "families"}`} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ ...sub, maxWidth: 560 }}>Live from Payments: families&apos; payments, the budget, income and fundraising, as of right now.</p>
        <span data-tour="snapshot-download">
          <Pill size="sm" variant="ghost" onClick={download}>
            <Icons.Download width={13} height={13} /> Download spreadsheet
          </Pill>
        </span>
      </div>

      <Section title="Money in" tour="snapshot-in">
        <Row label="Families' payments" value={s.moneyIn.families} />
        <Row label="Clinic and workout sign-ups" value={s.moneyIn.programs} />
        <Row label="Donations, sponsors and events" value={s.moneyIn.income} note={s.budget.incomeExpected ? `${formatAmount(s.budget.incomeExpected)} expected` : undefined} />
        <Row label="Fundraising" value={s.moneyIn.fundraising} />
        <Row label="Total" value={s.moneyIn.total} strong />
      </Section>

      {s.groups.length > 0 && (
        <Section title="Spending vs budget" tour="snapshot-groups">
          {s.groups.map((g) => (
            <div key={g.name} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{g.name}</span>
              <SpendBar spend={g.spend} />
            </div>
          ))}
        </Section>
      )}

      {s.teams.length > 0 && (
        <Section title="Teams">
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
        <Section title="Clinics and workouts">
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
        <Section title="Tournaments we host">
          {s.events.map((e) => (
            <Row key={e.name} label={e.name} value={e.income - e.spend.paid} note={`${formatAmount(e.income)} in · ${formatAmount(e.spend.paid)} out${e.expected ? ` · ${formatAmount(e.expected)} expected in` : ""}`} />
          ))}
        </Section>
      )}

      {(s.fundraisers.length > 0 || s.funds.length > 0) && (
        <Section title="Fundraising and funds">
          {s.fundraisers.map((f) => (
            <Row key={f.name} label={f.name} value={f.toFamilies + f.toFunds} note={`${formatAmount(f.toFamilies)} toward families' fees · ${formatAmount(f.toFunds)} to funds`} />
          ))}
          {s.funds.map((f) => (
            <Row key={f.name} label={f.name} value={f.total} note="The fund's total" />
          ))}
        </Section>
      )}

      <Section title="Families">
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

function Section({ title, tour, children }: { title: string; tour?: string; children: React.ReactNode }) {
  return (
    <div className="rsd-card" style={{ gap: 10, padding: "16px 18px" }} data-tour={tour}>
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>{title}</h3>
      {children}
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
