"use client";
import { useState } from "react";
import { Icons } from "../../components/icons";
import { Input, KpiCard, Pill, Select, Textarea } from "../../components/ui";
import { saveIncome, voidIncome } from "../../../lib/finances/club-actions";
import { formatAmount, formatDollars } from "../../../lib/finances/logic";
import { incomeLabel, type IncomeInput } from "../../../lib/finances/club-logic";
import { INCOME_CATEGORIES, type ClubData, type IncomeRow } from "../../../lib/finances/club-types";
import { ErrorNote, Sheet, formatDay, today } from "./parts";
import { Empty, MethodPicker, Notice, linkBtn, sub, useAct } from "./club-parts";

// Payments → Income (0131): money the club takes in that isn't a family's
// payment: donations, sponsors, the tournament we host, shirts sold, a
// vendor's credit. An entry can be only expected (the MRS registration
// budgeted at $4,000) until it comes in.
export function IncomeView({ data }: { data: ClubData }) {
  const { busy, error, notice, act } = useAct();
  const [open, setOpen] = useState<IncomeRow | "new" | null>(null);
  const live = data.income.filter((i) => !i.voided_at);
  const received = live.reduce((n, i) => n + i.amount_cents, 0);
  const expected = live.reduce((n, i) => n + (i.budget_cents ?? 0), 0);
  const waiting = live.filter((i) => i.amount_cents === 0);
  const funds = new Map(data.funds.map((f) => [f.id, f.name]));
  const events = new Map(data.events.map((e) => [e.id, e.name]));
  const programs = new Map(data.programs.map((p) => [p.id, p.name]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rsd-kpi-grid" data-tour="income-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}>
        <KpiCard label="Received" value={formatDollars(received)} sub={`${live.length - waiting.length} entries`} />
        <KpiCard label="Expected" value={formatDollars(expected)} sub="What you budgeted" />
        <KpiCard label="Not in yet" value={String(waiting.length)} sub={waiting.length === 1 ? "entry" : "entries"} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ ...sub, maxWidth: 560 }}>Families&apos; payments are on the Families tab. This is everything else that comes in.</p>
        <span data-tour="income-add">
          <Pill size="sm" variant="accent" onClick={() => setOpen("new")}>
            <Icons.Plus width={13} height={13} /> Add income
          </Pill>
        </span>
      </div>
      {notice && <Notice text={notice} />}
      {error && <ErrorNote text={error} />}
      {live.length === 0 ? (
        <Empty text="No income yet. Add donations, sponsors, the tournament you host and anything else that comes in." />
      ) : (
        INCOME_CATEGORIES.map((c) => {
          const rows = live.filter((i) => i.category === c.key);
          if (rows.length === 0) return null;
          return (
            // Closed by default: tap a category to see its entries.
            <details key={c.key} className="rsd-card income-section" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
              <summary style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", cursor: "pointer", listStyle: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span aria-hidden className="income-chevron" style={{ fontSize: 11, color: "var(--gw-fg-muted)", transition: "transform 0.15s" }}>
                    ▶
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{c.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-fg-muted)", whiteSpace: "nowrap" }}>
                    {`· ${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{formatAmount(rows.reduce((n, i) => n + i.amount_cents, 0))}</span>
              </summary>
              {rows.map((i) => {
                const tags = [
                  i.from_name,
                  i.event_id && events.get(i.event_id),
                  i.program_id && programs.get(i.program_id),
                  i.fund_id && `To ${funds.get(i.fund_id)}`,
                  i.received_on && formatDay(i.received_on),
                  i.reference && (i.method === "check" ? `#${i.reference}` : i.reference),
                ].filter(Boolean);
                return (
                  <div key={i.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 18px", borderTop: "1px solid var(--gw-border)", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.description}</div>
                      {tags.length > 0 && <div style={sub}>{tags.join(" · ")}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{i.amount_cents ? formatAmount(i.amount_cents) : "Not in yet"}</div>
                      {i.budget_cents ? <div style={sub}>Expected {formatAmount(i.budget_cents)}</div> : null}
                    </div>
                    <button type="button" style={linkBtn} onClick={() => setOpen(i)}>
                      {i.amount_cents ? "Edit" : "It came in"}
                    </button>
                    <button type="button" style={{ ...linkBtn, color: "var(--gw-fg-muted)" }} disabled={busy} onClick={() => confirm(`Void "${i.description}"?`) && act(() => voidIncome(i.id), "Voided.")}>
                      Void
                    </button>
                  </div>
                );
              })}
            </details>
          );
        })
      )}
      <style>{`.income-section > summary::-webkit-details-marker { display: none; } .income-section[open] .income-chevron { transform: rotate(90deg); }`}</style>
      {open && <IncomeSheet data={data} row={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function IncomeSheet({ data, row, onClose }: { data: ClubData; row: IncomeRow | null; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState<IncomeInput>(
    row
      ? {
          id: row.id,
          category: row.category,
          description: row.description,
          from_name: row.from_name ?? "",
          amount: row.amount_cents ? (row.amount_cents / 100).toFixed(2) : row.budget_cents ? (row.budget_cents / 100).toFixed(2) : "",
          budget: row.budget_cents ? (row.budget_cents / 100).toFixed(2) : "",
          received_on: row.received_on ?? today(),
          method: row.method ?? "check",
          reference: row.reference ?? "",
          program_id: row.program_id ?? "",
          event_id: row.event_id ?? "",
          fund_id: row.fund_id ?? "",
          note: row.note ?? "",
        }
      : { category: "donation", description: "", from_name: "", amount: "", budget: "", received_on: today(), method: "check", reference: "", program_id: "", event_id: "", fund_id: "", note: "" }
  );
  const up = (patch: Partial<IncomeInput>) => setF({ ...f, ...patch });
  return (
    <Sheet eyebrow="Income" title={row ? (row.amount_cents ? "Edit income" : "It came in") : "Add income"} busy={busy} onClose={onClose}>
      <Select label="What kind" value={f.category} onChange={(e) => up({ category: e.target.value })}>
        {INCOME_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </Select>
      <Input label="From" value={f.from_name} onChange={(e) => up({ from_name: e.target.value })} placeholder="Lanphier family" />
      <Input label="What it is" help={`Blank: "${incomeLabel(f.category)}: ${f.from_name || "…"}".`} value={f.description} onChange={(e) => up({ description: e.target.value })} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="Came in" help="Blank while it's only expected." inputMode="decimal" value={f.amount} onChange={(e) => up({ amount: e.target.value })} placeholder="2000" />
        <Input label="Expected" inputMode="decimal" value={f.budget} onChange={(e) => up({ budget: e.target.value })} placeholder="Optional" />
      </div>
      {f.amount.trim() && (
        <>
          <Input label="Date" type="date" value={f.received_on} onChange={(e) => up({ received_on: e.target.value })} />
          <MethodPicker label="How it came in" value={f.method} onChange={(v) => up({ method: v })} />
          <Input label={f.method === "check" ? "Check number" : "Reference"} value={f.reference} onChange={(e) => up({ reference: e.target.value })} placeholder="Optional" />
        </>
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
      <Select label="Goes to a fund" value={f.fund_id} onChange={(e) => up({ fund_id: e.target.value })}>
        <option value="">No, the club in general</option>
        {data.funds
          .filter((x) => !x.archived_at)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </Select>
      <Textarea label="Note" value={f.note} onChange={(e) => up({ note: e.target.value })} rows={2} placeholder="Optional" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveIncome(f))) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}
