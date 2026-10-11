"use client";
import { useMemo, useState } from "react";
import { Input, KpiCard, Pill, Select } from "../../components/ui";
import { addShift, moveShift, saveFund, saveFundraiser, voidShift } from "../../../lib/finances/club-actions";
import { formatAmount, formatDollars, parseAmount } from "../../../lib/finances/logic";
import { lastChoiceFor, shiftAmountCents, type ShiftInput } from "../../../lib/finances/club-logic";
import type { ClubData, Shift, ShiftDestination } from "../../../lib/finances/club-types";
import { ErrorNote, SegButton, SegGroup, Sheet, capStyle, formatDay } from "./parts";
import { Empty, Notice, linkBtn, sub, useAct } from "./club-parts";

function blankShift(data: ClubData): ShiftInput {
  const fundraiser = data.fundraisers.find((f) => !f.archived_at);
  return {
    fundraiser_id: fundraiser?.id ?? "",
    event_label: "",
    worked_on: "",
    worker_name: "",
    hours: "",
    amount: "",
    destination: "family",
    player_id: "",
    fund_id: data.funds.find((f) => !f.archived_at)?.id ?? "",
    note: "",
  };
}

// Payments → Fundraising (0131): shifts worked at a fundraiser like
// Nelson's Produce. The worker chooses where their earnings go: toward a
// player's registration and fees (a Fundraising credit on the family's
// account) or the general program fund (Buckets for Bucks).
export function FundraisingView({ data }: { data: ClubData }) {
  const { busy, error, notice, act } = useAct();
  const [f, setF] = useState<ShiftInput>(() => blankShift(data));
  const [moving, setMoving] = useState<Shift | null>(null);
  const [manage, setManage] = useState(false);
  const up = (patch: Partial<ShiftInput>) => setF((x) => ({ ...x, ...patch }));

  const live = data.shifts.filter((s) => !s.voided_at);
  const toFamilies = live.filter((s) => s.destination === "family").reduce((n, s) => n + s.amount_cents, 0);
  const players = new Map(data.players.map((p) => [p.id, p.full_name]));
  const funds = new Map(data.funds.map((x) => [x.id, x.name]));
  const fundraisers = new Map(data.fundraisers.map((x) => [x.id, x]));
  const openFunds = data.funds.filter((x) => !x.archived_at);
  const openFundraisers = data.fundraisers.filter((x) => !x.archived_at);
  const rate = fundraisers.get(f.fundraiser_id)?.rate_cents ?? data.settings.fundraising_rate_cents;
  const hours = Number(f.hours);
  const autoCents = Number.isFinite(hours) && hours > 0 ? shiftAmountCents(hours, rate) : 0;
  const workers = useMemo(() => [...new Set(data.shifts.map((s) => s.worker_name.trim()))].sort(), [data.shifts]);
  const labels = useMemo(() => [...new Set(data.shifts.map((s) => s.event_label).filter((x): x is string => !!x))], [data.shifts]);
  const defaultFund = openFunds[0];

  // Typing a name they've used before starts from their last choice.
  function setWorker(name: string) {
    const last = lastChoiceFor(name, data.shifts);
    up({ worker_name: name, ...(last ? { destination: last.destination, player_id: last.player_id ?? "", fund_id: last.fund_id ?? f.fund_id } : {}) });
  }

  async function save() {
    if (await act(() => addShift(f), `Logged ${f.worker_name.trim()}'s shift.`)) {
      // Keep the fundraiser, event and date for the next one from the same day.
      setF({ ...blankShift(data), fundraiser_id: f.fundraiser_id, event_label: f.event_label, worked_on: f.worked_on, fund_id: f.fund_id });
    }
  }

  const byLabel = new Map<string, Shift[]>();
  for (const s of [...live].reverse()) {
    const key = `${fundraisers.get(s.fundraiser_id)?.name ?? "Fundraiser"}${s.event_label ? ` – ${s.event_label}` : ""}`;
    byLabel.set(key, [...(byLabel.get(key) ?? []), s]);
  }
  const perPlayer = new Map<string, number>();
  for (const s of live) if (s.player_id && s.destination === "family") perPlayer.set(s.player_id, (perPlayer.get(s.player_id) ?? 0) + s.amount_cents);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rsd-kpi-grid" data-tour="fundraising-totals" style={{ "--rsd-kpi-num": "clamp(20px, 2.6vw, 36px)" } as React.CSSProperties}>
        <KpiCard label="Earned" value={formatDollars(toFamilies + live.filter((s) => s.destination === "fund").reduce((n, s) => n + s.amount_cents, 0))} sub={`${live.length} shifts`} />
        <KpiCard label="Toward families' fees" value={formatDollars(toFamilies)} sub={`${perPlayer.size} players`} />
        {openFunds.map((x) => (
          <KpiCard key={x.id} label={x.name} value={formatDollars(live.filter((s) => s.fund_id === x.id && s.destination === "fund").reduce((n, s) => n + s.amount_cents, 0))} sub="From shifts" />
        ))}
      </div>

      <div className="rsd-card" style={{ gap: 14, padding: "16px 18px" }} data-tour="fundraising-log">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Log a shift</h3>
          <button type="button" style={linkBtn} onClick={() => setManage(true)}>
            Fundraisers and funds
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
          <Select label="Fundraiser" value={f.fundraiser_id} onChange={(e) => up({ fundraiser_id: e.target.value })}>
            {openFundraisers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Input label="Event" list="fundraising-labels" value={f.event_label} onChange={(e) => up({ event_label: e.target.value })} placeholder="Tulip Festival" />
          <Input label="Date" type="date" value={f.worked_on} onChange={(e) => up({ worked_on: e.target.value })} />
        </div>
        <datalist id="fundraising-labels">
          {labels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <datalist id="fundraising-workers">
          {workers.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
          <Input label="Who worked" list="fundraising-workers" value={f.worker_name} onChange={(e) => setWorker(e.target.value)} placeholder="Sarah Wesner" />
          <Input label="Hours" inputMode="decimal" value={f.hours} onChange={(e) => up({ hours: e.target.value })} placeholder="4" />
          <Input
            label="Earned"
            help={`Blank: hours × ${formatAmount(rate)}${autoCents ? ` = ${formatAmount(autoCents)}` : ""}.`}
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => up({ amount: e.target.value })}
            placeholder={autoCents ? (autoCents / 100).toFixed(2) : "40"}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }} data-tour="fundraising-where">
          <span style={capStyle}>Where it goes (their choice)</span>
          <SegGroup label="Where it goes">
            <SegButton label="Toward registration" active={f.destination === "family"} onClick={() => up({ destination: "family" })} />
            <SegButton
              label={openFunds.length === 1 ? `General program fund (${defaultFund?.name})` : "General program fund"}
              active={f.destination === "fund"}
              onClick={() => up({ destination: "fund", fund_id: f.fund_id || defaultFund?.id || "" })}
            />
          </SegGroup>
        </div>
        {f.destination === "family" ? (
          <Select label="Whose fees" value={f.player_id} onChange={(e) => up({ player_id: e.target.value })}>
            <option value="">Pick a player</option>
            {data.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        ) : (
          openFunds.length > 1 && (
            <Select label="Fund" value={f.fund_id} onChange={(e) => up({ fund_id: e.target.value })}>
              {openFunds.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          )
        )}
        {error && <ErrorNote text={error} />}
        <div>
          <Pill variant="accent" size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Log shift"}
          </Pill>
        </div>
      </div>

      {notice && <Notice text={notice} />}

      {live.length === 0 ? (
        <Empty text="No shifts yet. Log each person's shift above; a shift toward registration shows on their family's balance right away." />
      ) : (
        [...byLabel].map(([label, shifts]) => (
          <div key={label} className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 18px", gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{formatAmount(shifts.reduce((n, s) => n + s.amount_cents, 0))}</span>
            </div>
            {shifts.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 18px", borderTop: "1px solid var(--gw-border)", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                    {s.worker_name} <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}>· {s.hours} h{s.worked_on ? ` · ${formatDay(s.worked_on)}` : ""}</span>
                  </div>
                  <div style={sub}>{s.destination === "family" ? `Toward ${players.get(s.player_id ?? "") ?? "a player"}'s fees` : `To ${funds.get(s.fund_id ?? "") ?? "a fund"}`}</div>
                </div>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{formatAmount(s.amount_cents)}</span>
                <button type="button" style={linkBtn} onClick={() => setMoving(s)}>
                  Change
                </button>
                <button type="button" style={{ ...linkBtn, color: "var(--gw-fg-muted)" }} disabled={busy} onClick={() => confirm(`Void ${s.worker_name}'s shift?`) && act(() => voidShift(s.id), "Shift voided.")}>
                  Void
                </button>
              </div>
            ))}
          </div>
        ))
      )}

      {perPlayer.size > 0 && (
        <div className="rsd-card" style={{ gap: 8, padding: "16px 18px" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>Toward each player&apos;s fees</h3>
          {[...perPlayer]
            .sort((a, b) => (players.get(a[0]) ?? "").localeCompare(players.get(b[0]) ?? ""))
            .map(([id, cents]) => (
              <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{players.get(id) ?? "Player"}</span>
                <span style={{ fontWeight: 700 }}>{formatAmount(cents)}</span>
              </div>
            ))}
        </div>
      )}

      {moving && <MoveSheet data={data} shift={moving} onClose={() => setMoving(null)} />}
      {manage && <ManageSheet data={data} onClose={() => setManage(false)} />}
    </div>
  );
}

function MoveSheet({ data, shift, onClose }: { data: ClubData; shift: Shift; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [destination, setDestination] = useState<ShiftDestination>(shift.destination);
  const [playerId, setPlayerId] = useState(shift.player_id ?? "");
  const [fundId, setFundId] = useState(shift.fund_id ?? data.funds.find((x) => !x.archived_at)?.id ?? "");
  const openFunds = data.funds.filter((x) => !x.archived_at);
  return (
    <Sheet eyebrow={`${shift.worker_name} · ${formatAmount(shift.amount_cents)}`} title="Where it goes" busy={busy} onClose={onClose}>
      <div style={sub}>If it was on a family&apos;s account, that credit is voided and the new one posted, so the history shows the change.</div>
      <SegGroup label="Where it goes">
        <SegButton label="Toward registration" active={destination === "family"} onClick={() => setDestination("family")} />
        <SegButton label="General program fund" active={destination === "fund"} onClick={() => setDestination("fund")} />
      </SegGroup>
      {destination === "family" ? (
        <Select label="Whose fees" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
          <option value="">Pick a player</option>
          {data.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </Select>
      ) : (
        <Select label="Fund" value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {openFunds.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      )}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 8 }}>
        <Pill variant="accent" onClick={async () => (await act(() => moveShift(shift.id, { destination, player_id: playerId, fund_id: fundId }), "Moved.")) && onClose()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>
    </Sheet>
  );
}

function ManageSheet({ data, onClose }: { data: ClubData; onClose: () => void }) {
  const { busy, error, notice, act } = useAct();
  const [rates, setRates] = useState<Record<string, string>>(Object.fromEntries(data.fundraisers.map((x) => [x.id, (x.rate_cents / 100).toFixed(2)])));
  const [fresh, setFresh] = useState({ name: "", rate: (data.settings.fundraising_rate_cents / 100).toFixed(2) });
  const [fund, setFund] = useState({ name: "", description: "" });
  return (
    <Sheet eyebrow="Fundraising" title="Fundraisers and funds" busy={busy} onClose={onClose}>
      <span style={capStyle}>Fundraisers: what an hour earns</span>
      {data.fundraisers.map((x) => (
        <div key={x.id} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, paddingBottom: 12 }}>{x.name}</div>
          <div style={{ width: 110 }}>
            <Input aria-label={`${x.name} rate`} inputMode="decimal" value={rates[x.id] ?? ""} onChange={(e) => setRates({ ...rates, [x.id]: e.target.value })} />
          </div>
          {parseAmount(rates[x.id] ?? "") !== x.rate_cents && (
            <Pill size="sm" variant="accent" onClick={() => act(() => saveFundraiser({ id: x.id, name: x.name, rate: rates[x.id] }), "Saved.")} disabled={busy}>
              Save
            </Pill>
          )}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <Input label="New fundraiser" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} placeholder="Like Concessions" />
        </div>
        <div style={{ width: 110 }}>
          <Input label="Per hour" inputMode="decimal" value={fresh.rate} onChange={(e) => setFresh({ ...fresh, rate: e.target.value })} />
        </div>
        <Pill size="sm" variant="accent" onClick={async () => (await act(() => saveFundraiser(fresh), "Added.")) && setFresh({ ...fresh, name: "" })} disabled={busy || !fresh.name.trim()}>
          Add
        </Pill>
      </div>
      <span style={{ ...capStyle, marginTop: 8 }}>Funds: where money can go besides a family&apos;s fees</span>
      {data.funds.map((x) => (
        <div key={x.id}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{x.name}</div>
          {x.description && <div style={sub}>{x.description}</div>}
        </div>
      ))}
      <Input label="New fund" value={fund.name} onChange={(e) => setFund({ ...fund, name: e.target.value })} placeholder="Like Travel fund" />
      <Input label="What it's for" value={fund.description} onChange={(e) => setFund({ ...fund, description: e.target.value })} placeholder="Optional" />
      <div>
        <Pill size="sm" variant="accent" onClick={async () => (await act(() => saveFund(fund), "Added.")) && setFund({ name: "", description: "" })} disabled={busy || !fund.name.trim()}>
          Add fund
        </Pill>
      </div>
      {notice && <Notice text={notice} />}
      {error && <ErrorNote text={error} />}
    </Sheet>
  );
}
