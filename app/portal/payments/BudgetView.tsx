"use client";
import { useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, KpiCard, Pill, Select, Textarea } from "../../components/ui";
import {
  recordExpensePayment,
  saveBudgetGroup,
  saveBudgetLine,
  saveHostedEvent,
  splitAcrossTeam,
  voidBudgetLine,
  voidExpensePayment,
} from "../../../lib/finances/club-actions";
import { formatAmount, formatDollars, parseAmount } from "../../../lib/finances/logic";
import {
  groupRows,
  monthLabel,
  overBudget,
  paidByLine,
  spendBy,
  splitEvenly,
  type LineInput,
} from "../../../lib/finances/club-logic";
import { EXPENSE_METHODS, type BudgetLine, type ClubData } from "../../../lib/finances/club-types";
import { ErrorNote, SegButton, SegGroup, Sheet, capStyle, formatDay, today } from "./parts";
import { Empty, MethodPicker, Notice, SpendBar, linkBtn, sub, useAct } from "./club-parts";
import { ImportSheet } from "./ImportSheet";
import { IMPORT_NOTE } from "../../../lib/finances/import-sheet";

type View = "group" | "team" | "month";
type Open =
  | { kind: "line"; line: BudgetLine | null; groupId?: string }
  | { kind: "pay"; line: BudgetLine }
  | { kind: "split"; line: BudgetLine }
  | { kind: "groups" }
  | { kind: "event" }
  | { kind: "import" }
  | null;

// Payments → Budget (0131): what the club planned to spend and what it has
// paid, by group, team or month. Each line takes payments (a deposit, then
// the rest, with check numbers), and a team cost can be split across that
// team's families.
export function BudgetView({ data }: { data: ClubData }) {
  const { busy, error, notice, act, setNotice } = useAct();
  const [view, setView] = useState<View>("group");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Sections start closed; a search opens every one with a match.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());
  const toggleSection = (key: string) =>
    setOpenSections((cur) => {
      const out = new Set(cur);
      if (!out.delete(key)) out.add(key);
      return out;
    });
  const [open, setOpen] = useState<Open>(null);

  const paid = useMemo(() => paidByLine(data.expensePayments), [data.expensePayments]);
  const live = data.lines.filter((l) => !l.voided_at);
  const totals = live.reduce((t, l) => ({ budget: t.budget + l.budget_cents, paid: t.paid + (paid.get(l.id) ?? 0) }), { budget: 0, paid: 0 });
  const overLines = live.filter((l) => overBudget({ budget: l.budget_cents, paid: paid.get(l.id) ?? 0 }));
  const toPay = live.reduce((n, l) => n + Math.max(0, l.budget_cents - (paid.get(l.id) ?? 0)), 0);

  const team = new Map(data.teams.map((t) => [t.id, t.name]));
  const program = new Map(data.programs.map((p) => [p.id, p.name]));
  const event = new Map(data.events.map((e) => [e.id, e.name]));
  const q = query.trim().toLowerCase();
  const matches = (l: BudgetLine) =>
    !q ||
    [l.description, l.vendor, l.team_id && team.get(l.team_id), l.program_id && program.get(l.program_id), l.event_id && event.get(l.event_id), monthLabel(l.month)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);

  // The sections the list shows, for the chosen view.
  const sections: { key: string; title: string; lines: BudgetLine[]; groupId?: string }[] =
    view === "group"
      ? groupRows(data.groups, data.lines, data.expensePayments).map((g) => ({ key: g.group.id, title: g.group.name, lines: g.lines.filter(matches), groupId: g.group.id }))
      : view === "team"
        ? [
            ...data.teams.map((t) => ({ key: t.id, title: t.name, lines: live.filter((l) => l.team_id === t.id && matches(l)) })),
            { key: "club", title: "Not for one team", lines: live.filter((l) => !l.team_id && matches(l)) },
          ]
        : [...new Set(live.map((l) => l.month ?? ""))]
            .sort((a, b) => (a || "9999").localeCompare(b || "9999"))
            .map((m) => ({ key: m || "none", title: m ? monthLabel(m) : "No month", lines: live.filter((l) => (l.month ?? "") === m && matches(l)) }));
  const shown = sections.filter((s) => s.lines.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rsd-kpi-grid" data-tour="budget-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}>
        <KpiCard label="Budgeted" value={formatDollars(totals.budget)} sub={`${live.length} ${live.length === 1 ? "line" : "lines"}`} />
        <KpiCard label="Paid" value={formatDollars(totals.paid)} sub={`${data.expensePayments.filter((p) => !p.voided_at).length} payments`} />
        <KpiCard label="Left to pay" value={formatDollars(toPay)} sub="Of what's budgeted" />
        <KpiCard label="Over budget" value={String(overLines.length)} sub={overLines.length === 1 ? "line" : "lines"} accent={overLines.length > 0} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search costs, vendors, teams or months"
          aria-label="Search the budget"
          style={{ flex: "1 1 260px", maxWidth: 420, height: 40, padding: "0 14px", borderRadius: 10, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13, fontWeight: 500 }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span data-tour="budget-view">
            <SegGroup label="Show by">
              <SegButton label="Group" active={view === "group"} onClick={() => setView("group")} />
              <SegButton label="Team" active={view === "team"} onClick={() => setView("team")} />
              <SegButton label="Month" active={view === "month"} onClick={() => setView("month")} />
            </SegGroup>
          </span>
          <span data-tour="budget-add">
            <Pill size="sm" variant="accent" onClick={() => setOpen({ kind: "line", line: null })}>
              <Icons.Plus width={13} height={13} /> Add a cost
            </Pill>
          </span>
          <Pill size="sm" variant="ghost" onClick={() => setOpen({ kind: "groups" })}>
            Groups
          </Pill>
          <Pill size="sm" variant="ghost" onClick={() => setOpen({ kind: "event" })}>
            Tournaments we host
          </Pill>
          <span data-tour="budget-import">
            <Pill size="sm" variant="ghost" onClick={() => setOpen({ kind: "import" })}>
              Import spreadsheet
            </Pill>
          </span>
        </div>
      </div>

      {notice && <Notice text={notice} />}
      {error && <ErrorNote text={error} />}

      {live.length === 0 && !q && (
        <Empty text="Nothing budgeted yet. Import this season's spreadsheet, or add the season's costs (insurance, gym rent by month, each team's leagues and tournaments) with Add a cost, then record each check as it goes out." />
      )}

      {shown.map((s) => {
        const spend = s.lines.reduce((t, l) => ({ budget: t.budget + l.budget_cents, paid: t.paid + (paid.get(l.id) ?? 0) }), { budget: 0, paid: 0 });
        const isOpen = !!q || openSections.has(s.key);
        return (
          <div key={s.key} className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }} data-tour="budget-group">
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", flexWrap: "wrap" }}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleSection(s.key)}
                data-tour="budget-group-toggle"
                style={{ flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center", gap: 10, border: "none", background: "none", padding: 0, textAlign: "left", color: "inherit", cursor: "pointer" }}
              >
                <span aria-hidden style={{ fontSize: 11, color: "var(--gw-fg-muted)", transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none" }}>
                  ▶
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 800 }}>{s.title}</span>
                  <span style={{ ...sub, display: "block" }}>
                    {s.lines.length} {s.lines.length === 1 ? "line" : "lines"}
                  </span>
                </span>
              </button>
              <SpendBar spend={spend} />
              {s.groupId && (
                <button type="button" style={linkBtn} onClick={() => setOpen({ kind: "line", line: null, groupId: s.groupId })}>
                  + Add
                </button>
              )}
            </div>
            {isOpen && s.lines.map((l) => (
              <LineRow
                key={l.id}
                line={l}
                data={data}
                paid={paid.get(l.id) ?? 0}
                expanded={expanded === l.id}
                onToggle={() => setExpanded(expanded === l.id ? null : l.id)}
                onOpen={(kind) => setOpen({ kind, line: l } as Open)}
                busy={busy}
                onVoidPayment={(id) => confirm("Void this payment?") && act(() => voidExpensePayment(id), "Payment voided.")}
                onVoidLine={() => confirm(`Void "${l.description}"?`) && act(() => voidBudgetLine(l.id), "Line voided.")}
                names={{ team, program, event }}
              />
            ))}
          </div>
        );
      })}

      {open?.kind === "line" && <LineSheet data={data} line={open.line} groupId={open.groupId} onClose={() => setOpen(null)} />}
      {open?.kind === "pay" && <PaySheet line={open.line} paid={paid.get(open.line.id) ?? 0} onClose={() => setOpen(null)} />}
      {open?.kind === "split" && <SplitSheet data={data} line={open.line} onClose={() => setOpen(null)} onDone={setNotice} />}
      {open?.kind === "groups" && <GroupsSheet data={data} onClose={() => setOpen(null)} />}
      {open?.kind === "event" && <EventsSheet data={data} onClose={() => setOpen(null)} />}
      {open?.kind === "import" && <ImportSheet imported={data.lines.some((l) => !l.voided_at && l.note === IMPORT_NOTE)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LineRow({
  line: l,
  data,
  paid,
  expanded,
  onToggle,
  onOpen,
  onVoidPayment,
  onVoidLine,
  busy,
  names,
}: {
  line: BudgetLine;
  data: ClubData;
  paid: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (kind: "line" | "pay" | "split") => void;
  onVoidPayment: (id: string) => void;
  onVoidLine: () => void;
  busy: boolean;
  names: { team: Map<string, string>; program: Map<string, string>; event: Map<string, string> };
}) {
  const payments = data.expensePayments.filter((p) => p.line_id === l.id && !p.voided_at);
  const passed = data.lineCharges.filter((c) => c.line_id === l.id && !c.voided);
  const tags = [
    l.vendor,
    l.team_id && names.team.get(l.team_id),
    l.program_id && names.program.get(l.program_id),
    l.event_id && names.event.get(l.event_id),
    monthLabel(l.month),
  ].filter(Boolean);
  return (
    <div style={{ borderTop: "1px solid var(--gw-border)" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-tour="budget-line"
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", border: "none", background: expanded ? "var(--gw-bg)" : "transparent", color: "var(--gw-fg)", textAlign: "left", cursor: "pointer" }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>{l.description}</span>
          {tags.length > 0 && <span style={sub}>{tags.join(" · ")}</span>}
          {passed.length > 0 && (
            <span style={{ ...sub, fontWeight: 600 }}>
              {formatAmount(passed.reduce((n, c) => n + c.amount_cents, 0))} passed on to {passed.length} {passed.length === 1 ? "player" : "players"}
            </span>
          )}
        </div>
        <SpendBar spend={{ budget: l.budget_cents, paid }} compact />
      </button>
      {expanded && (
        <div style={{ padding: "4px 18px 16px", display: "flex", flexDirection: "column", gap: 12, background: "var(--gw-bg)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-tour="budget-line-actions">
            <Pill size="sm" variant="accent" onClick={() => onOpen("pay")}>
              Record a payment
            </Pill>
            <Pill size="sm" variant="light" onClick={() => onOpen("split")}>
              Split across team
            </Pill>
            <Pill size="sm" variant="light" onClick={() => onOpen("line")}>
              Edit
            </Pill>
            <Pill size="sm" variant="ghost" onClick={onVoidLine} disabled={busy}>
              Void
            </Pill>
          </div>
          {l.note && <div style={sub}>{l.note}</div>}
          {payments.length === 0 ? (
            <div style={sub}>Nothing paid yet.</div>
          ) : (
            payments.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{formatAmount(p.amount_cents)}</span>
                <span style={{ color: "var(--gw-fg-muted)", flex: 1, minWidth: 0 }}>
                  {formatDay(p.paid_on)} · {EXPENSE_METHODS.find((m) => m.key === p.method)?.label ?? p.method}
                  {p.reference ? ` · ${p.method === "check" ? "#" : ""}${p.reference}` : ""}
                  {p.note ? ` · ${p.note}` : ""}
                </span>
                <button type="button" style={{ ...linkBtn, color: "var(--gw-fg-muted)" }} onClick={() => onVoidPayment(p.id)} disabled={busy}>
                  Void
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function emptyLine(groupId: string): LineInput {
  return { group_id: groupId, team_id: "", program_id: "", event_id: "", vendor: "", description: "", month: "", budget: "", note: "" };
}

function LineSheet({ data, line, groupId, onClose }: { data: ClubData; line: BudgetLine | null; groupId?: string; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState<LineInput>(
    line
      ? {
          id: line.id,
          group_id: line.group_id,
          team_id: line.team_id ?? "",
          program_id: line.program_id ?? "",
          event_id: line.event_id ?? "",
          vendor: line.vendor ?? "",
          description: line.description,
          month: line.month ? line.month.slice(0, 7) : "",
          budget: line.budget_cents ? (line.budget_cents / 100).toFixed(2) : "",
          note: line.note ?? "",
        }
      : emptyLine(groupId ?? data.groups[0]?.id ?? "")
  );
  const up = (patch: Partial<LineInput>) => setF({ ...f, ...patch });
  return (
    <Sheet eyebrow="Budget" title={line ? "Edit a cost" : "Add a cost"} busy={busy} onClose={onClose}>
      <Select label="Group" value={f.group_id} onChange={(e) => up({ group_id: e.target.value })}>
        {data.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </Select>
      <Input label="What it's for" value={f.description} onChange={(e) => up({ description: e.target.value })} placeholder="Regionals registration" autoFocus />
      <Input label="Vendor" value={f.vendor} onChange={(e) => up({ vendor: e.target.value })} placeholder="Optional, like St Marks or Conquerors League" />
      <Input label="Budget" help="What you plan to spend. Leave blank for a cost you didn't plan for." inputMode="decimal" value={f.budget} onChange={(e) => up({ budget: e.target.value })} placeholder="260" />
      <Input label="Month" help="For costs by month, like gym rent." type="month" value={f.month} onChange={(e) => up({ month: e.target.value })} />
      <Select label="Team" value={f.team_id} onChange={(e) => up({ team_id: e.target.value })}>
        <option value="">Not for one team</option>
        {data.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      {data.programs.length > 0 && (
        <Select label="Clinic or workout" value={f.program_id} onChange={(e) => up({ program_id: e.target.value })}>
          <option value="">None</option>
          {data.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
      {data.events.length > 0 && (
        <Select label="Tournament we host" value={f.event_id} onChange={(e) => up({ event_id: e.target.value })}>
          <option value="">None</option>
          {data.events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name}
            </option>
          ))}
        </Select>
      )}
      <Textarea label="Note" value={f.note} onChange={(e) => up({ note: e.target.value })} rows={2} placeholder="Optional" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveBudgetLine(f))) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}

function PaySheet({ line, paid, onClose }: { line: BudgetLine; paid: number; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const left = Math.max(0, line.budget_cents - paid);
  const [amount, setAmount] = useState(left ? (left / 100).toFixed(2) : "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("check");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet eyebrow={line.description} title="Record a payment" busy={busy} onClose={onClose}>
      <div style={{ ...sub, fontWeight: 600 }}>
        {line.budget_cents ? `${formatAmount(paid)} paid of ${formatAmount(line.budget_cents)} budgeted.` : `${formatAmount(paid)} paid so far. No budget.`}
      </div>
      <Input label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="530.00" autoFocus />
      <Input label="Paid on" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <MethodPicker value={method} onChange={setMethod} />
      <Input label={method === "check" ? "Check number" : "Reference"} value={reference} onChange={(e) => setReference(e.target.value)} placeholder={method === "check" ? "2165" : "Optional"} />
      <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, like Deposit" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => recordExpensePayment(line.id, { amount, date, method, reference, note }))) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save payment"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}

function SplitSheet({ data, line, onClose, onDone }: { data: ClubData; line: BudgetLine; onClose: () => void; onDone: (notice: string) => void }) {
  const { busy, error, act } = useAct();
  const [teamId, setTeamId] = useState(line.team_id ?? data.teams[0]?.id ?? "");
  const onTeam = (id: string) => data.players.filter((p) => p.team_id === id);
  const [picked, setPicked] = useState<Set<string>>(new Set(onTeam(line.team_id ?? data.teams[0]?.id ?? "").map((p) => p.id)));
  const [each, setEach] = useState(false);
  const [amount, setAmount] = useState(line.budget_cents ? (line.budget_cents / 100).toFixed(2) : "");
  const [description, setDescription] = useState(line.description);
  const players = onTeam(teamId);
  const cents = parseAmount(amount);
  const shares = cents && picked.size ? (each ? [...picked].map(() => cents) : splitEvenly(cents, picked.size)) : [];
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Sheet eyebrow={line.description} title="Split across team" busy={busy} onClose={onClose}>
      <div style={sub}>Each player picked gets a Team cost charge on their family&apos;s Payments account. The club&apos;s own payment on this line doesn&apos;t change.</div>
      <Select
        label="Team"
        value={teamId}
        onChange={(e) => {
          setTeamId(e.target.value);
          setPicked(new Set(onTeam(e.target.value).map((p) => p.id)));
        }}
      >
        {data.teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
      <Input label="What families see" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Input label={each ? "Amount for each player" : "Total to split"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <SegGroup label="How to charge">
        <SegButton label="Split the total" active={!each} onClick={() => setEach(false)} />
        <SegButton label="Same amount each" active={each} onClick={() => setEach(true)} />
      </SegGroup>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={capStyle}>
          Players ({picked.size} of {players.length})
        </span>
        {players.length === 0 && <div style={sub}>No players on this team yet.</div>}
        {players.map((p) => (
          <label key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, fontWeight: 600 }}>
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} style={{ width: 16, height: 16, accentColor: "var(--rsd-accent)" }} />
            {p.full_name}
          </label>
        ))}
      </div>
      {shares.length > 0 && (
        <div style={{ ...sub, fontWeight: 700, color: "var(--gw-fg)" }}>
          {each ? `${formatAmount(shares[0])} each` : `${formatAmount(Math.min(...shares))}${Math.min(...shares) !== Math.max(...shares) ? `–${formatAmount(Math.max(...shares))}` : ""} each`} ·{" "}
          {formatAmount(shares.reduce((n, s) => n + s, 0))} in all
        </div>
      )}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill
          variant="accent"
          onClick={async () => {
            const res = await act(() => splitAcrossTeam({ lineId: line.id, playerIds: [...picked], amount, each, description }));
            // The sheet closes, so its note goes on the Budget tab.
            if (res) {
              onDone(res.notice ?? "Charged.");
              onClose();
            }
          }}
          disabled={busy || picked.size === 0}
        >
          {busy ? "Charging…" : `Charge ${picked.size} ${picked.size === 1 ? "player" : "players"}`}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}

function GroupsSheet({ data, onClose }: { data: ClubData; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(data.groups.map((g) => [g.id, g.name])));
  const [fresh, setFresh] = useState("");
  return (
    <Sheet eyebrow="Budget" title="Groups" busy={busy} onClose={onClose}>
      <div style={sub}>How the budget is grouped. Rename one to change it everywhere.</div>
      {data.groups.map((g) => (
        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input aria-label="Group name" value={names[g.id] ?? ""} onChange={(e) => setNames({ ...names, [g.id]: e.target.value })} />
          </div>
          {names[g.id] !== g.name && (
            <Pill size="sm" variant="accent" onClick={() => act(() => saveBudgetGroup({ id: g.id, name: names[g.id] }), "Renamed.")} disabled={busy}>
              Save
            </Pill>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Input label="New group" value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Like Banquet" />
        </div>
        <Pill size="sm" variant="accent" onClick={async () => (await act(() => saveBudgetGroup({ name: fresh }), "Added.")) && setFresh("")} disabled={busy || !fresh.trim()}>
          Add
        </Pill>
      </div>
      {error && <ErrorNote text={error} />}
    </Sheet>
  );
}

function EventsSheet({ data, onClose }: { data: ClubData; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState({ name: "", starts_on: "", ends_on: "", note: "" });
  const spend = spendBy("event_id", data.lines, data.expensePayments);
  return (
    <Sheet eyebrow="Budget" title="Tournaments we host" busy={busy} onClose={onClose}>
      <div style={sub}>
        A tournament the club runs, like MRS, has its own costs (court rental, refs) and its own income (registration, admissions).
        Pick it on each cost here and on each income on the Income tab, and the Snapshot shows what it made.
      </div>
      {data.events.map((e) => (
        <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{e.name}</div>
            <div style={sub}>{[e.starts_on && formatDay(e.starts_on), e.note].filter(Boolean).join(" · ") || "No date yet"}</div>
          </div>
          <SpendBar spend={spend.get(e.id) ?? { budget: 0, paid: 0 }} compact />
        </div>
      ))}
      <span style={{ ...capStyle, marginTop: 8 }}>Add one</span>
      <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="MRS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="First day" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
        <Input label="Last day" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
      </div>
      <Input label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveHostedEvent(f), "Added.")) && setF({ name: "", starts_on: "", ends_on: "", note: "" })} disabled={busy || !f.name.trim()}>
          Add tournament
        </Pill>
      </div>
    </Sheet>
  );
}
