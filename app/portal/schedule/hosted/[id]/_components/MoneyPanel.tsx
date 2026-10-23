"use client";
// The Money tab: the tournament's budget, like the bottom of the director's
// spreadsheet. Revenue: the team fees (from the teams entered), sponsors,
// admissions; expenses: court fees, referees (by the games on the schedule)
// and anything else, each a count times an amount, with the net. Then
// Finances: link the tournament to its entry in Finances and "Update the
// budget" puts these numbers on Finances → Budget and Income, beside what's
// actually been paid and received.

import Link from "next/link";
import { useState } from "react";
import { Icons } from "../../../../../components/icons";
import { Input, Pill, Select } from "../../../../../components/ui";
import { deleteMoney, saveMoney } from "../../../../../../lib/hosted/actions";
import { linkFinanceEvent, sendToBudget } from "../../../../../../lib/hosted/finance-actions";
import { lineCount, lineTotal, moneySummary, teamFee } from "../../../../../../lib/hosted/logic";
import { MONEY_CATEGORIES, type HostedMoney, type HostedPageData, type MoneyCategory, type MoneyKind } from "../../../../../../lib/hosted/types";
import { ErrorNote, Said, Section, Sheet, cap, grid2, money, sub, useAct } from "./parts";

type Open = { line: HostedMoney | null; kind: MoneyKind; category: MoneyCategory } | null;

export function MoneyPanel({ data }: { data: HostedPageData }) {
  const [open, setOpen] = useState<Open>(null);
  const { plan, teams, games } = data;
  const sum = moneySummary(plan, teams, data.money, games);
  const paying = teams.filter((t) => teamFee(t, plan.team_fee_cents) > 0);

  const block = (kind: MoneyKind) =>
    MONEY_CATEGORIES.filter((c) => c.kind === kind).map((c) => {
      const lines = data.money.filter((m) => m.kind === kind && m.category === c.key);
      const total = lines.reduce((n, m) => n + lineTotal(m, games), 0);
      return (
        <div key={`${kind}-${c.key}`} style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--gw-border)", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span style={cap}>{c.label}</span>
            <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <button type="button" onClick={() => setOpen({ line: null, kind, category: c.key })} style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", cursor: "pointer" }}>
                + Add
              </button>
              <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
            </span>
          </div>
          {lines.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpen({ line: m, kind, category: c.key })}
              style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "baseline", padding: "6px 0", background: "none", border: "none", textAlign: "left", cursor: "pointer", color: "inherit" }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {m.label}
                {m.category === "referee" && m.qty == null && (
                  <span style={{ ...sub, display: "block" }}>
                    Follows the games of {m.division_id ? (data.divisions.find((d) => d.id === m.division_id)?.name ?? "a division") : "every division"}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {formatCount(lineCount(m, games))} × {money(m.unit_cents)}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 80, textAlign: "right" }}>{money(lineTotal(m, games))}</span>
            </button>
          ))}
        </div>
      );
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section title="Revenue" tour="hosted-money" subtitle="Estimates. What actually comes in is recorded in Finances.">
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--gw-border)", paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <span style={cap}>Team fees</span>
            <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(sum.teamFees)}</span>
          </div>
          <span style={sub}>
            {paying.length} of {teams.length} {teams.length === 1 ? "team" : "teams"} paying
            {plan.team_fee_cents != null ? `, ${money(plan.team_fee_cents)} each unless a team says otherwise` : ". Set the team fee under Details on the Checklist tab"}. Change a team&apos;s fee on the Teams tab.
          </span>
        </div>
        {block("revenue")}
        <Total label="Total revenue" cents={sum.revenue} />
      </Section>

      <Section title="Expenses">
        {block("expense")}
        <Total label="Total expenses" cents={sum.expense} />
      </Section>

      <Section title="Net" subtitle="Revenue less expenses.">
        <div style={{ fontSize: 28, fontWeight: 800, color: sum.net < 0 ? "var(--gw-error)" : "var(--gw-fg)", fontVariantNumeric: "tabular-nums" }}>{money(sum.net)}</div>
      </Section>

      <FinanceCard data={data} />

      {open && <MoneySheet data={data} open={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

function Total({ label, cents }: { label: string; cents: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "2px solid var(--gw-border)", paddingTop: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{money(cents)}</span>
    </div>
  );
}

function MoneySheet({ data, open, onClose }: { data: HostedPageData; open: NonNullable<Open>; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const wid = data.weekend.id;
  const cat = MONEY_CATEGORIES.find((c) => c.kind === open.kind && c.key === open.category)!;
  const line = open.line;
  const [f, setF] = useState({
    label: line?.label ?? "",
    qty: line?.qty != null ? String(line.qty) : "",
    unit: line ? (line.unit_cents / 100).toFixed(line.unit_cents % 100 ? 2 : 0) : "",
    division_id: line?.division_id ?? "",
    note: line?.note ?? "",
  });
  const referee = open.category === "referee";
  return (
    <Sheet eyebrow={cat.label} title={line ? line.label : `Add to ${cat.label.toLowerCase()}`} busy={busy} onClose={onClose}>
      <Input
        label="What"
        value={f.label}
        onChange={(e) => setF({ ...f, label: e.target.value })}
        autoFocus={!line}
        placeholder={{ sponsor: "Court sponsor (court banner)", admission: "Family weekend pass", court: "Iowa West Friday", referee: "JV Boys (2 refs)", other: "Program printing" }[open.category]}
      />
      <div style={grid2}>
        <Input label={cat.count} inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder={referee ? "The games" : "1"} />
        <Input label={`${cat.each} ($)`} inputMode="decimal" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="0" />
      </div>
      {referee && (
        <Select
          label="Games of"
          value={f.division_id}
          onChange={(e) => setF({ ...f, division_id: e.target.value })}
          help="Leave the count blank and it follows the games on the schedule: this division's, or every division's."
        >
          <option value="">Every division</option>
          {data.divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({data.games.filter((g) => g.division_id === d.id).length} games)
            </option>
          ))}
        </Select>
      )}
      <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Last year: $1,950" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill
          variant="accent"
          disabled={busy || !f.label.trim()}
          onClick={async () => (await act(() => saveMoney(wid, { id: line?.id, kind: open.kind, category: open.category, ...f, division_id: f.division_id || null }))) && onClose()}
        >
          {busy ? "Saving…" : line ? "Save" : "Add"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
        {line && (
          <Pill
            variant="ghost"
            disabled={busy}
            style={{ marginLeft: "auto", color: "var(--gw-error)" }}
            onClick={async () => {
              if (!confirm(`Take ${line.label} off the budget?`)) return;
              if (await act(() => deleteMoney(wid, line.id))) onClose();
            }}
          >
            <Icons.Trash width={12} height={12} /> Remove
          </Pill>
        )}
      </div>
    </Sheet>
  );
}

// What Finances has for the tournament, for those who can see Finances.
function FinanceCard({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const fin = data.finance;
  const wid = data.weekend.id;
  const [pick, setPick] = useState("");
  if (!fin) {
    return (
      <Section title="Finances" subtitle="The Treasurer sends this estimate to the club's budget from here, and sees what's actually been paid and received." tour="hosted-finances">
        <span style={sub}>Only people who can see Finances see the actual money here.</span>
      </Section>
    );
  }
  if (!fin.event) {
    return (
      <Section title="Finances" tour="hosted-finances" subtitle="Link this tournament to its entry in Finances (Budget → Tournaments we host) to put the estimate in the budget.">
        {fin.canManage ? (
          <>
            <Select label="Tournament in Finances" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick one…</option>
              <option value="new">Add {data.weekend.event || "this tournament"} to Finances</option>
              {fin.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Said error={error} notice={notice} />
            <div>
              <Pill variant="accent" disabled={busy || !pick} onClick={() => act(() => linkFinanceEvent(wid, pick))}>
                Link to Finances
              </Pill>
            </div>
          </>
        ) : (
          <span style={sub}>Not linked yet. Ask the Treasurer to link it here.</span>
        )}
      </Section>
    );
  }
  const budgeted = fin.lines.reduce((n, l) => n + l.budget_cents, 0);
  const paid = fin.lines.reduce((n, l) => n + l.paid_cents, 0);
  const expected = fin.income.reduce((n, i) => n + i.budget_cents, 0);
  const received = fin.income.reduce((n, i) => n + i.amount_cents, 0);
  const synced = fin.links.map((l) => l.synced_at).sort().pop();
  return (
    <Section
      title={`Finances: ${fin.event.name}`}
      tour="hosted-finances"
      subtitle={synced ? `Budget last updated from this plan ${new Date(synced).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" })}.` : "The estimate isn't in the budget yet."}
      action={
        <>
          {fin.canManage && (
            <Pill size="sm" variant="accent" disabled={busy} onClick={() => act(() => sendToBudget(wid))}>
              {synced ? "Update the budget" : "Put it in the budget"}
            </Pill>
          )}
          <Link href="/portal/payments?tab=budget" style={{ fontSize: 12.5, fontWeight: 700, alignSelf: "center" }}>
            Open Finances
          </Link>
        </>
      }
    >
      <Said error={error} notice={notice} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Ledger title="Costs" planned="Budgeted" actual="Paid" rows={fin.lines.map((l) => ({ id: l.id, label: l.description, planned: l.budget_cents, actual: l.paid_cents }))} />
        <Ledger title="Income" planned="Expected" actual="Received" rows={fin.income.map((i) => ({ id: i.id, label: i.description, planned: i.budget_cents, actual: i.amount_cents }))} />
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: "2px solid var(--gw-border)", paddingTop: 10 }}>
        <Figure label="Budgeted net" cents={expected - budgeted} />
        <Figure label="Actual so far" cents={received - paid} />
      </div>
      {fin.canManage && (
        <span style={sub}>
          Update the budget after changing the estimate: each cost becomes a line in the Events group, and each income (and the team fees) an expected
          income, all tagged {fin.event.name}. Record payments and money received on Finances → Budget and Income as usual.
        </span>
      )}
    </Section>
  );
}

function Ledger({ title, planned, actual, rows }: { title: string; planned: string; actual: string; rows: { id: string; label: string; planned: number; actual: number }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8 }}>
        <span style={cap}>{title}</span>
        <span style={{ ...cap, textAlign: "right" }}>{planned}</span>
        <span style={{ ...cap, textAlign: "right" }}>{actual}</span>
      </div>
      {rows.length === 0 && <span style={sub}>Nothing yet.</span>}
      {rows.map((r) => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontWeight: 600 }}>{r.label}</span>
          <span style={{ textAlign: "right" }}>{money(r.planned)}</span>
          <span style={{ textAlign: "right", fontWeight: 700 }}>{money(r.actual)}</span>
        </div>
      ))}
      {rows.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, fontSize: 12.5, fontWeight: 800, borderTop: "1px solid var(--gw-border)", paddingTop: 4, fontVariantNumeric: "tabular-nums" }}>
          <span>Total</span>
          <span style={{ textAlign: "right" }}>{money(rows.reduce((n, r) => n + r.planned, 0))}</span>
          <span style={{ textAlign: "right" }}>{money(rows.reduce((n, r) => n + r.actual, 0))}</span>
        </div>
      )}
    </div>
  );
}

function Figure({ label, cents }: { label: string; cents: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={cap}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: cents < 0 ? "var(--gw-error)" : "var(--gw-fg)", fontVariantNumeric: "tabular-nums" }}>{money(cents)}</span>
    </div>
  );
}
