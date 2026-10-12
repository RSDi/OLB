"use client";
import { useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { archiveProgram, cancelSignup, coverWithCredit, markSignupPaid, saveProgram, setProgramOpen } from "../../../lib/finances/club-actions";
import { formatAmount } from "../../../lib/finances/logic";
import { coveredByNelsons, priceRange, programTotals, signupState, type ProgramInput } from "../../../lib/finances/club-logic";
import { PROGRAM_KINDS, type ClubData, type Program, type ProgramSignup } from "../../../lib/finances/club-types";
import { ErrorNote, SegButton, SegGroup, Sheet, capStyle, formatDay, today } from "./parts";
import { Empty, Notice, linkBtn, sub, useAct } from "./club-parts";

const STATE_LABEL = { paid: "Paid", owes: "Owes", waived: "Waived", on_account: "On their account" } as const;

// Payments → Programs (0131): clinics, spring and summer workouts and camps.
// Families sign up on the public page; a player on this season's roster gets
// the fee on their family's Payments account, anyone else pays on the
// sign-up. Costs linked on the Budget tab show what each one made.
export function ProgramsView({ data, siteUrl }: { data: ClubData; siteUrl: string }) {
  const { busy, error, notice, act, setNotice } = useAct();
  const [open, setOpen] = useState<Program | "new" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<ProgramSignup | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const programs = data.programs.filter((p) => showArchived || !p.archived_at);
  const archived = data.programs.filter((p) => p.archived_at).length;

  async function copy(p: Program) {
    const url = `${siteUrl}/sign-up/${p.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice(`Copied ${url}`);
    } catch {
      setNotice(url);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ ...sub, maxWidth: 560 }}>
          Clinics and workouts outside the season. Open one and families sign up on its own page, linked from the Summer page.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {archived > 0 && (
            <button type="button" style={linkBtn} onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Hide finished" : `Show finished (${archived})`}
            </button>
          )}
          <span data-tour="programs-add">
            <Pill size="sm" variant="accent" onClick={() => setOpen("new")}>
              <Icons.Plus width={13} height={13} /> Add a program
            </Pill>
          </span>
        </div>
      </div>
      {notice && <Notice text={notice} />}
      {error && <ErrorNote text={error} />}
      {programs.length === 0 && <Empty text="No clinics or workouts yet. Add one, set its prices, and open it for sign-up." />}
      {programs.map((p) => {
        const t = programTotals(p.id, data);
        const signups = data.signups.filter((s) => s.program_id === p.id && !s.cancelled_at);
        const owing = signups.filter((s) => signupState(s) === "owes").length;
        return (
          <div key={p.id} className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }} data-tour="programs-card">
            <div style={{ display: "flex", gap: 12, padding: "14px 18px", flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>
                  {p.name} <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)", fontSize: 13 }}>· {priceRange(p.levels)}</span>
                </div>
                <div style={sub}>
                  {[PROGRAM_KINDS.find((k) => k.key === p.kind)?.label, p.starts_on && `${formatDay(p.starts_on)}${p.ends_on ? ` – ${formatDay(p.ends_on)}` : ""}`, p.location]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div style={{ ...sub, fontWeight: 600 }}>
                  {t.signups} signed up{p.capacity ? ` of ${p.capacity}` : ""} · {formatAmount(t.billed)} in fees · costs {formatAmount(t.costs.paid)}
                  {owing ? ` · ${owing} still owe` : ""}
                </div>
              </div>
              {p.archived_at ? (
                <span className="rsd-chip rsd-chip-mute">Finished</span>
              ) : (
                <span data-tour="programs-open">
                  <SegGroup label={`${p.name} sign-up`}>
                    <SegButton label="Closed" active={!p.open} onClick={() => p.open && act(() => setProgramOpen(p.id, false), "Sign-up closed.")} />
                    <SegButton label="Open" active={p.open} onClick={() => !p.open && act(() => setProgramOpen(p.id, true), "Sign-up is open.")} />
                  </SegGroup>
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 14, padding: "0 18px 14px", flexWrap: "wrap" }}>
              <button type="button" style={linkBtn} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                {expanded === p.id ? "Hide sign-ups" : `Sign-ups (${signups.length})`}
              </button>
              {p.open && (
                <button type="button" style={linkBtn} onClick={() => copy(p)}>
                  Copy sign-up link
                </button>
              )}
              <button type="button" style={linkBtn} onClick={() => setOpen(p)}>
                Edit
              </button>
              <button type="button" style={{ ...linkBtn, color: "var(--gw-fg-muted)" }} disabled={busy} onClick={() => act(() => archiveProgram(p.id, !p.archived_at))}>
                {p.archived_at ? "Bring back" : "Finished"}
              </button>
            </div>
            {expanded === p.id && (
              <div style={{ borderTop: "1px solid var(--gw-border)" }}>
                {signups.length === 0 && <div style={{ ...sub, padding: "12px 18px" }}>Nobody yet.</div>}
                {signups.map((s) => {
                  const state = signupState(s);
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 18px", borderTop: "1px solid var(--gw-border)", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                          {s.child_first} {s.child_last}
                          {s.level ? <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}> · {s.level}</span> : null}
                        </div>
                        <div style={sub}>{[s.parent_name, s.parent_email, s.parent_phone].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className={`rsd-chip ${state === "owes" ? "rsd-chip-error" : state === "paid" ? "rsd-chip-accent" : "rsd-chip-mute"}`}>
                        {coveredByNelsons(s) ? "Covered by Nelson's" : STATE_LABEL[state]}
                        {state === "owes" ? ` ${formatAmount(s.price_cents - s.paid_cents)}` : ""}
                      </span>
                      {!s.charge_id && (
                        <button type="button" style={linkBtn} onClick={() => setPaying(s)}>
                          {state === "owes" ? "Mark paid" : "Change"}
                        </button>
                      )}
                      <button
                        type="button"
                        style={{ ...linkBtn, color: "var(--gw-fg-muted)" }}
                        disabled={busy}
                        onClick={() => confirm(`Cancel ${s.child_first}'s sign-up?`) && act(() => cancelSignup(s.id))}
                      >
                        Cancel
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {open && <ProgramSheet program={open === "new" ? null : open} onClose={() => setOpen(null)} />}
      {paying && <PaidSheet signup={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function ProgramSheet({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState<ProgramInput>(
    program
      ? {
          id: program.id,
          name: program.name,
          kind: program.kind,
          starts_on: program.starts_on ?? "",
          ends_on: program.ends_on ?? "",
          schedule: program.schedule ?? "",
          location: program.location ?? "",
          description: program.description ?? "",
          levels: program.levels.map((l) => ({ label: l.label, amount: (l.cents / 100).toFixed(2) })),
          capacity: program.capacity ? String(program.capacity) : "",
        }
      : { name: "", kind: "clinic", starts_on: "", ends_on: "", schedule: "", location: "", description: "", levels: [{ label: "Everyone", amount: "" }], capacity: "" }
  );
  const up = (patch: Partial<ProgramInput>) => setF({ ...f, ...patch });
  const upLevel = (i: number, patch: Partial<{ label: string; amount: string }>) => up({ levels: f.levels.map((l, n) => (n === i ? { ...l, ...patch } : l)) });
  return (
    <Sheet eyebrow="Programs" title={program ? "Edit program" : "Add a program"} busy={busy} onClose={onClose}>
      <Input label="Name" value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="Summer Clinics 2027" autoFocus />
      <Select label="What kind" value={f.kind} onChange={(e) => up({ kind: e.target.value })}>
        {PROGRAM_KINDS.map((k) => (
          <option key={k.key} value={k.key}>
            {k.label}
          </option>
        ))}
      </Select>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Input label="First day" type="date" value={f.starts_on} onChange={(e) => up({ starts_on: e.target.value })} />
        <Input label="Last day" type="date" value={f.ends_on} onChange={(e) => up({ ends_on: e.target.value })} />
      </div>
      <Input label="When" value={f.schedule} onChange={(e) => up({ schedule: e.target.value })} placeholder="Mondays 6–8pm, Saturdays 4–6pm" />
      <Input label="Where" value={f.location} onChange={(e) => up({ location: e.target.value })} placeholder="Concordia Lutheran School" />
      <Textarea label="About it" help="Families read this on the sign-up page." value={f.description} onChange={(e) => up({ description: e.target.value })} rows={3} placeholder="8 sessions for boys 7–18. T-shirt included!" />
      <span style={capStyle}>Prices</span>
      {f.levels.map((l, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto", gap: 10, alignItems: "end" }}>
          <Input aria-label="Level" value={l.label} onChange={(e) => upLevel(i, { label: e.target.value })} placeholder="High school" />
          <Input aria-label="Price" inputMode="decimal" value={l.amount} onChange={(e) => upLevel(i, { amount: e.target.value })} placeholder="60" />
          <Pill size="sm" variant="ghost" onClick={() => up({ levels: f.levels.filter((_, n) => n !== i) })} disabled={f.levels.length <= 1}>
            Remove
          </Pill>
        </div>
      ))}
      <div>
        <button type="button" style={linkBtn} onClick={() => up({ levels: [...f.levels, { label: "", amount: "" }] })}>
          + Another price, like Junior high and High school
        </button>
      </div>
      <Input label="Room for" help="Sign-up closes on its own when it's full. Blank: no limit." inputMode="numeric" value={f.capacity} onChange={(e) => up({ capacity: e.target.value })} />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveProgram(f))) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}

function PaidSheet({ signup, onClose }: { signup: ProgramSignup; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [amount, setAmount] = useState(((signup.paid_cents || signup.price_cents) / 100).toFixed(2));
  const [method, setMethod] = useState<string>(signup.paid_method ?? "venmo");
  const [date, setDate] = useState(signup.paid_on ?? today());
  const [reference, setReference] = useState(signup.paid_ref ?? "");
  const methods = [
    ["venmo", "Venmo"],
    ["check", "Check"],
    ["cash", "Cash"],
    ["card", "Card"],
    ...(signup.player_id ? [["nelsons", "Nelson's credit"]] : []),
    ["waived", "No charge"],
  ];
  const save = () => (method === "nelsons" ? coverWithCredit(signup.id) : markSignupPaid(signup.id, { amount, method, date, reference }));
  return (
    <Sheet eyebrow={`${signup.child_first} ${signup.child_last}`} title="Mark paid" busy={busy} onClose={onClose}>
      <div style={{ ...sub, fontWeight: 600 }}>The price is {formatAmount(signup.price_cents)}.</div>
      <SegGroup label="How they paid">
        {methods.map(([k, label]) => (
          <SegButton key={k} label={label} active={method === k} onClick={() => setMethod(k)} />
        ))}
      </SegGroup>
      {method === "nelsons" && <div style={sub}>Puts the fee on their family&apos;s account, where their Nelson&apos;s Produce credit pays it.</div>}
      {method !== "waived" && method !== "nelsons" && (
        <>
          <Input label="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Paid on" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label={method === "check" ? "Check number" : "Reference"} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
        </>
      )}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(save)) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}
