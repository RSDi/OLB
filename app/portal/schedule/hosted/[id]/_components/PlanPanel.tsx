"use client";
// The Checklist tab: what has to happen before the tournament, by section
// (Facility: secured, walk-through, point of contact, pricing, certificate
// of insurance, contract; then Teams, Referees and table, Communication,
// Game day), each with a due date and a note. Under it, the tournament's
// Details: its short name, team fee, the days and times, courts and game
// length the Schedule fills, and what the program email says about the
// facility, concessions, admission and rules.

import { useState } from "react";
import Link from "next/link";
import { Icons } from "../../../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../../../components/ui";
import { addStep, deleteStep, savePlan, setHosted, updateStep } from "../../../../../../lib/hosted/actions";
import { daysForWeekend, feeLockNote, formatDay, orderHostedSteps } from "../../../../../../lib/hosted/logic";
import { STEP_SECTIONS, type HostedPageData, type HostedStep, type StepSection } from "../../../../../../lib/hosted/types";
import { teamFeesAreBilled } from "../../../../../../lib/invoicing/auto-steps";
import { ErrorNote, Said, Section, Sheet, cap, grid2, iconBtn, money, sub, useAct } from "./parts";

export function PlanPanel({ data, today }: { data: HostedPageData; today: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Checklist data={data} today={today} />
      <Details data={data} />
    </div>
  );
}

function Checklist({ data, today }: { data: HostedPageData; today: string }) {
  const { busy, error, act } = useAct();
  const [editing, setEditing] = useState<HostedStep | null>(null);
  const [adding, setAdding] = useState<StepSection | null>(null);
  const [label, setLabel] = useState("");
  const wid = data.weekend.id;
  return (
    <Section
      title="Checklist"
      tour="hosted-checklist"
      subtitle="Everything a tournament we host needs, from securing the facility to game day. Tick a step when it's done."
    >
      <Said error={error} notice={null} />
      {STEP_SECTIONS.map((sec) => {
        const rows = orderHostedSteps(data.steps.filter((s) => s.section === sec.key));
        if (rows.length === 0 && sec.key === "other" && adding !== "other") return null;
        const done = rows.filter((r) => r.done_on).length;
        return (
          <div key={sec.key} style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--gw-border)", paddingTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={cap}>
                {sec.label} {rows.length > 0 && `· ${done} of ${rows.length}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAdding(adding === sec.key ? null : sec.key);
                  setLabel("");
                }}
                style={{ background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", cursor: "pointer" }}
              >
                + Add a step
              </button>
            </div>
            {rows.map((s) => {
              const late = !s.done_on && s.due_on && s.due_on < today;
              const auto = s.step_key === "invoices_sent" || s.step_key === "team_fees_collected";
              const billing = data.billing;
              const hl = s.step_key === "bill_programs" || s.step_key === "invoices_sent" || s.step_key === "team_fees_collected";
              const checked =
                s.step_key === "bill_programs"
                  ? data.feeLock.locked
                  : !billing?.canView
                    ? !!s.done_on
                    : s.step_key === "invoices_sent"
                      ? !!billing.allSent
                      : s.step_key === "team_fees_collected"
                        ? !!billing.allCollected
                        : !!s.done_on;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: hl ? 10 : "6px 0",
                    margin: hl ? "4px 0" : 0,
                    background: hl ? "var(--rsd-accent-bg, #fff6cc)" : undefined,
                    border: hl ? "1px solid var(--rsd-accent-line, #f1d66b)" : undefined,
                    borderRadius: hl ? 12 : undefined,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busy || auto}
                    title={auto ? "Checks itself" : undefined}
                    aria-label={`${s.label}: done`}
                    onChange={(e) => act(() => updateStep(wid, s.id, { done: e.target.checked }))}
                    style={{ width: 18, height: 18, marginTop: 1, accentColor: "var(--rsd-accent-fill)", flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {s.step_key === "bill_programs" ? (
                      <Link
                        href={`/portal/schedule/hosted/${wid}/bill`}
                        style={{ fontSize: 13.5, fontWeight: 600, textDecoration: checked ? "line-through" : "underline", textUnderlineOffset: 3, color: checked ? "var(--gw-fg-muted)" : "var(--gw-fg)" }}
                      >
                        {s.label}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: checked ? "line-through" : "none", color: checked ? "var(--gw-fg-muted)" : "var(--gw-fg)" }}>
                        {s.label}
                      </span>
                    )}
                    {s.step_key === "bill_programs" && billing && (
                      <>
                        <small style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                          {data.plan.team_fee_cents ? `${money(data.plan.team_fee_cents)}/team` : "Set the team fee in Details"}
                          {billing.canView && billing.depositPerTeamCents > 0 ? ` · ${money(billing.depositPerTeamCents)}/team deposit` : ""}
                          {billing.canView ? (billing.billed ? ` · ${billing.invoiceCount} invoices in Finances` : " · not billed yet") : ""}
                        </small>
                        {billing.billed && billing.canView && <span style={{ color: "#065f46", fontWeight: 800, fontSize: 12 }}>✓ Invoices exist — fees locked</span>}
                        {billing.canInvoice && (
                          <a href={`/portal/schedule/hosted/${wid}/bill`} className="rsd-btn" style={{ alignSelf: "flex-start", minHeight: 36, padding: "0 12px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)", fontWeight: 700, fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                            Bill programs → Finance
                          </a>
                        )}
                      </>
                    )}
                    {s.step_key === "invoices_sent" && billing && billing.canView && (
                      <small style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
                        {billing.allSent ? <span style={{ color: "#065f46", fontWeight: 800 }}>✓ Auto-checked</span> : <span>Checks itself when all {billing.programCount} are sent</span>}
                        <b style={{ color: "var(--gw-fg)" }}>
                          {billing.sentCount} of {billing.programCount} sent
                        </b>
                        <span style={{ height: 8, borderRadius: 100, background: "#fff", border: "1px solid var(--gw-border)", overflow: "hidden", display: "block" }}>
                          <i style={{ display: "block", height: "100%", width: `${Math.min(100, billing.programCount ? (billing.sentCount / billing.programCount) * 100 : 0)}%`, background: "var(--gw-ink)" }} />
                        </span>
                      </small>
                    )}
                    {s.step_key === "team_fees_collected" && billing && billing.canView && (
                      <small style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600, display: "flex", flexDirection: "column", gap: 4 }}>
                        {billing.allCollected ? <span style={{ color: "#065f46", fontWeight: 800 }}>✓ Auto-checked</span> : <span>Checks itself when everything is collected</span>}
                        <b style={{ color: "var(--gw-fg)" }}>
                          {teamFeesAreBilled(billing.sentCount)
                            ? `${money(billing.collectedCents)} of ${money(billing.billedCents || 0)} collected`
                            : "Not billed yet"}
                        </b>
                        <span style={{ height: 8, borderRadius: 100, background: "#fff", border: "1px solid var(--gw-border)", overflow: "hidden", display: "block" }}>
                          <i style={{ display: "block", height: "100%", width: `${Math.min(100, billing.billedCents ? (billing.collectedCents / billing.billedCents) * 100 : 0)}%`, background: "var(--gw-ink)" }} />
                        </span>
                        {billing.billed && (
                          <a href={`/portal/payments/invoices/event/${wid}`} style={{ fontWeight: 800, fontSize: 13, color: "var(--gw-fg)", textUnderlineOffset: 3 }}>
                            View in Finances →
                          </a>
                        )}
                      </small>
                    )}
                    {(s.due_on || s.done_on || s.note) && !hl && (
                      <span style={{ fontSize: 12, color: late ? "var(--gw-error)" : "var(--gw-fg-muted)", fontWeight: 600 }}>
                        {[s.done_on ? `Done ${formatDay(s.done_on, { short: true })}` : s.due_on ? `${late ? "Was due" : "Due"} ${formatDay(s.due_on, { short: true })}` : null, s.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                  <button type="button" style={iconBtn} aria-label={`Edit ${s.label}`} onClick={() => setEditing(s)}>
                    <Icons.Pencil width={13} height={13} />
                  </button>
                </div>
              );
            })}
            {adding === sec.key && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if ((await act(() => addStep(wid, sec.key, label))) !== false) {
                    setLabel("");
                    setAdding(null);
                  }
                }}
                style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "6px 0" }}
              >
                <div style={{ flex: 1 }}>
                  <Input aria-label="New step" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Book the scoreboard operator" autoFocus />
                </div>
                <Pill size="sm" variant="accent" type="submit" disabled={busy || !label.trim()}>
                  Add
                </Pill>
              </form>
            )}
          </div>
        );
      })}
      {!data.steps.some((s) => s.section === "other") && adding !== "other" && (
        <button type="button" onClick={() => setAdding("other")} style={{ alignSelf: "flex-start", background: "none", border: "none", fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)", cursor: "pointer", padding: 0 }}>
          + Add a step under Other
        </button>
      )}
      {editing && <StepSheet wid={wid} step={editing} onClose={() => setEditing(null)} />}
    </Section>
  );
}

function StepSheet({ wid, step, onClose }: { wid: string; step: HostedStep; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [label, setLabel] = useState(step.label);
  const [due, setDue] = useState(step.due_on ?? "");
  const [note, setNote] = useState(step.note ?? "");
  return (
    <Sheet eyebrow="Checklist" title="Edit step" busy={busy} onClose={onClose}>
      <Input label="Step" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Input label="Due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Who has it, a link to the contract, what the facility said…" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill variant="accent" onClick={async () => (await act(() => updateStep(wid, step.id, { label, due_on: due || null, note }))) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
        <Pill
          variant="ghost"
          onClick={async () => {
            if (!confirm(`Take "${step.label}" off the checklist?`)) return;
            if (await act(() => deleteStep(wid, step.id))) onClose();
          }}
          disabled={busy}
          style={{ marginLeft: "auto", color: "var(--gw-error)" }}
        >
          <Icons.Trash width={12} height={12} /> Remove
        </Pill>
      </div>
    </Sheet>
  );
}

function Details({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const { plan, weekend } = data;
  const [f, setF] = useState(() => ({
    short_name: plan.short_name ?? "",
    team_fee: plan.team_fee_cents != null ? (plan.team_fee_cents / 100).toFixed(plan.team_fee_cents % 100 ? 2 : 0) : "",
    game_minutes: plan.game_minutes,
    courts: plan.courts,
    days: daysForWeekend(weekend.starts_on, weekend.ends_on, plan.days),
    facility: plan.facility ?? "",
    concessions: plan.concessions ?? "",
    admission: plan.admission ?? "",
    rules: plan.rules ?? "",
  }));
  const up = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const setDay = (i: number, p: Partial<(typeof f.days)[number]>) => up({ days: f.days.map((d, j) => (j === i ? { ...d, ...p } : d)) });

  return (
    <Section
      title="Details"
      tour="hosted-details"
      subtitle="The days and courts the Schedule fills, the team fee the Money tab counts, and what the program email says."
    >
      <div style={grid2}>
        <Input label="Short name" value={f.short_name} onChange={(e) => up({ short_name: e.target.value })} placeholder="MRS" help="How Finances and the email name it." />
        <Input
          label="Team fee ($)"
          inputMode="decimal"
          value={f.team_fee}
          onChange={(e) => up({ team_fee: e.target.value })}
          placeholder="240"
          readOnly={data.feeLock.locked}
          help={data.feeLock.locked ? feeLockNote(data.feeLock.invoiceCount) : "What a team pays to come, unless its own fee says otherwise. Our teams pay nothing."}
          style={data.feeLock.locked ? { background: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" } : undefined}
        />
        <Select label="Game slot" value={String(f.game_minutes)} onChange={(e) => up({ game_minutes: Number(e.target.value) })} help="How long each game has on a court, warm-up included.">
          {[45, 50, 60, 65, 70, 75, 80, 90, 105, 120].map((m) => (
            <option key={m} value={m}>
              {m} minutes{m === 75 ? " (1 hr 15)" : ""}
            </option>
          ))}
        </Select>
        <Select label="Courts" value={String(f.courts)} onChange={(e) => up({ courts: Number(e.target.value) })}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={cap}>Days</span>
        {f.days.map((d, i) => (
          <div key={d.date} style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "4px 10px", alignItems: "end" }}>
            <span style={{ gridColumn: "1 / -1", fontSize: 13.5, fontWeight: 700 }}>{formatDay(d.date)}</span>
            <Input label="First game" type="time" value={d.start} onChange={(e) => setDay(i, { start: e.target.value })} />
            <Input label="Gym closes" type="time" value={d.end} onChange={(e) => setDay(i, { end: e.target.value })} />
          </div>
        ))}
        <p style={sub}>Fill the courts (on the Schedule tab) puts games between the first game and closing each day, a game slot apart.</p>
      </div>
      <Textarea label="Facility" value={f.facility} onChange={(e) => up({ facility: e.target.value })} rows={2} placeholder="5 Arena Way, Council Bluffs, IA 51501" />
      <Textarea label="Concessions" value={f.concessions} onChange={(e) => up({ concessions: e.target.value })} rows={2} placeholder="Concessions by the Fieldhouse Cafe. No outside food or drink (water bottles for players are fine)." />
      <Textarea label="Admission" value={f.admission} onChange={(e) => up({ admission: e.target.value })} rows={2} placeholder="Day pass $5, weekend pass $8, family weekend $30, 5 and under free." />
      <Textarea
        label="Game information and rules"
        value={f.rules}
        onChange={(e) => up({ rules: e.target.value })}
        rows={5}
        placeholder={"First listed team is home (book); visitor runs the clock.\nVarsity 8-minute quarters, JV 7, JH 6.\nRunning clock with a 25-point lead in the 4th.\nTie-breakers: head to head, point differential…"}
      />
      <Said error={error} notice={notice} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill
          variant="accent"
          onClick={() =>
            act(
              () =>
                savePlan(weekend.id, {
                  ...f,
                  game_minutes: Number(f.game_minutes),
                  courts: Number(f.courts),
                }),
              "Saved."
            )
          }
          disabled={busy}
        >
          {busy ? "Saving…" : "Save details"}
        </Pill>
        {data.feeLock.locked ? (
          <span style={sub}>{feeLockNote(data.feeLock.invoiceCount)}</span>
        ) : plan.team_fee_cents != null ? (
          <span style={sub}>Team fee now {money(plan.team_fee_cents)}.</span>
        ) : null}
        <Pill
          variant="ghost"
          size="sm"
          style={{ marginLeft: "auto" }}
          disabled={busy}
          onClick={async () => {
            if (!confirm("We aren't hosting this one after all? The plan is kept, and ticking We host this tournament on the weekend brings it back.")) return;
            await act(() => setHosted(weekend.id, false));
          }}
        >
          We&apos;re not hosting this
        </Pill>
      </div>
    </Section>
  );
}
