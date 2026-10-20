"use client";
// The Teams tab: the divisions (HS Boys A, HS Girls, JH Boys…), each a pool
// where everyone plays everyone or a bracket, and the teams entered in each
// with their seed and fee. "Add the teams coming" brings in every program
// marked Yes on the HS Schedule and our own teams playing that weekend.
// "Make the games" builds a division's games from its teams.

import { useState } from "react";
import { Icons } from "../../../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../../../components/ui";
import {
  addTeamsFromSchedule,
  buildDivisionGames,
  clearDivisionGames,
  deleteDivision,
  deleteTeam,
  saveDivision,
  saveTeam,
} from "../../../../../../lib/hosted/actions";
import { feeLockNote, placementBracket, roundRobin, seeded, teamFee } from "../../../../../../lib/hosted/logic";
import type { DivisionFormat, HostedDivision, HostedPageData, HostedTeam } from "../../../../../../lib/hosted/types";
import { Empty, ErrorNote, Said, Section, Sheet, grid2, iconBtn, money, sub, useAct } from "./parts";

type Open = { kind: "division"; division: HostedDivision | null } | { kind: "team"; team: HostedTeam | null; division: string | null } | null;

export function TeamsPanel({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const [open, setOpen] = useState<Open>(null);
  const wid = data.weekend.id;
  const loose = data.teams.filter((t) => !t.division_id || !data.divisions.some((d) => d.id === t.division_id));
  const coming = data.programs.filter((p) => p.status === "confirmed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section
        title="Divisions and teams"
        tour="hosted-teams"
        subtitle={`${data.teams.length} ${data.teams.length === 1 ? "team" : "teams"} entered · ${coming} ${coming === 1 ? "program" : "programs"} coming on the HS Schedule`}
        action={
          <>
            <Pill size="sm" variant="accent" onClick={() => setOpen({ kind: "division", division: null })}>
              <Icons.Plus width={13} height={13} /> Add a division
            </Pill>
            <Pill size="sm" variant="ghost" onClick={() => setOpen({ kind: "team", team: null, division: null })}>
              Add a team
            </Pill>
            <Pill size="sm" variant="ghost" disabled={busy} onClick={() => act(() => addTeamsFromSchedule(wid))}>
              Add the teams coming
            </Pill>
          </>
        }
      >
        <Said error={error} notice={notice} />
        {data.divisions.length === 0 && (
          <Empty>
            No divisions yet. Add one for each group that plays together: <strong>HS Boys A</strong>, <strong>HS Boys B</strong>,{" "}
            <strong>HS Girls</strong>, <strong>JH Boys</strong>…
          </Empty>
        )}
      </Section>

      {data.divisions.map((d) => {
        const teams = seeded(data.teams.filter((t) => t.division_id === d.id));
        const games = data.games.filter((g) => g.division_id === d.id);
        const willMake = d.format === "bracket" ? placementBracket(teams.length).length : roundRobin(teams.length).length;
        return (
          <Section
            key={d.id}
            title={`${d.name}${d.code ? ` (${d.code})` : ""}`}
            subtitle={`${d.format === "bracket" ? "Bracket: every team plays every round, for every place" : "Pool: everyone plays everyone"} · ${teams.length} ${teams.length === 1 ? "team" : "teams"} · ${games.length} ${games.length === 1 ? "game" : "games"}`}
            action={
              <>
                <Pill
                  size="sm"
                  variant={games.length ? "ghost" : "accent"}
                  disabled={busy || teams.length < 2}
                  onClick={() => {
                    if (games.length && !confirm(`Make ${d.name}'s games again? Its ${games.length} games (times and scores too) are replaced with ${willMake} new ones.`)) return;
                    act(() => buildDivisionGames(wid, d.id));
                  }}
                >
                  {games.length ? "Make the games again" : `Make the games${teams.length >= 2 ? ` (${willMake})` : ""}`}
                </Pill>
                <button type="button" style={iconBtn} aria-label={`Add a team to ${d.name}`} onClick={() => setOpen({ kind: "team", team: null, division: d.id })}>
                  <Icons.Plus width={13} height={13} />
                </button>
                <button type="button" style={iconBtn} aria-label={`Edit ${d.name}`} onClick={() => setOpen({ kind: "division", division: d })}>
                  <Icons.Pencil width={13} height={13} />
                </button>
              </>
            }
          >
            {teams.length === 0 ? (
              <Empty>No teams yet. Edit a team below to put it here, or press + to add one.</Empty>
            ) : (
              <TeamList teams={teams} defaultFee={data.plan.team_fee_cents} onEdit={(t) => setOpen({ kind: "team", team: t, division: t.division_id })} />
            )}
          </Section>
        );
      })}

      {loose.length > 0 && (
        <Section title="Not in a division yet" subtitle="Tap a team to put it in its division.">
          <TeamList teams={loose} defaultFee={data.plan.team_fee_cents} onEdit={(t) => setOpen({ kind: "team", team: t, division: null })} />
        </Section>
      )}

      {open?.kind === "division" && <DivisionSheet wid={wid} division={open.division} games={data.games.filter((g) => g.division_id === open.division?.id).length} onClose={() => setOpen(null)} />}
      {open?.kind === "team" && (
        <TeamSheet
          wid={wid}
          team={open.team}
          division={open.division}
          divisions={data.divisions}
          feesLocked={data.feeLock.locked}
          lockNote={feeLockNote(data.feeLock.invoiceCount, data.feeLock.lookupFailed)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function TeamList({ teams, defaultFee, onEdit }: { teams: HostedTeam[]; defaultFee: number | null; onEdit: (t: HostedTeam) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {teams.map((t) => {
        const fee = teamFee(t, defaultFee);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onEdit(t)}
            style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", background: "none", border: "none", borderTop: "1px solid var(--gw-border)", textAlign: "left", cursor: "pointer", color: "inherit" }}
          >
            <span style={{ width: 26, fontSize: 12, fontWeight: 800, color: "var(--gw-fg-muted)", fontVariantNumeric: "tabular-nums" }}>{t.seed ? `#${t.seed}` : ""}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
              {t.code && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{t.code}</span>}
              {t.ours && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--rsd-accent)" }}>Ours</span>}
              {t.note && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{t.note}</span>}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: fee ? "var(--gw-fg)" : "var(--gw-fg-muted)", fontVariantNumeric: "tabular-nums" }}>{fee ? money(fee) : "No fee"}</span>
          </button>
        );
      })}
    </div>
  );
}

function DivisionSheet({ wid, division, games, onClose }: { wid: string; division: HostedDivision | null; games: number; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState({ name: division?.name ?? "", code: division?.code ?? "", format: (division?.format ?? "pool") as DivisionFormat });
  return (
    <Sheet eyebrow="Teams" title={division ? `Edit ${division.name}` : "Add a division"} busy={busy} onClose={onClose}>
      <Input label="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="HS Boys A" autoFocus={!division} />
      <Input label="Short name" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="HSA" help="What the court schedule shows: HSA (OL vs KCM)." />
      <Select label="How they play" value={f.format} onChange={(e) => setF({ ...f, format: e.target.value as DivisionFormat })}>
        <option value="pool">Pool: everyone plays everyone</option>
        <option value="bracket">Bracket: winners play winners, losers play losers, every place decided</option>
      </Select>
      {division && games > 0 && <p style={sub}>Changing how they play takes effect when you press Make the games again.</p>}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveDivision(wid, { id: division?.id, ...f }))) && onClose()} disabled={busy || !f.name.trim()}>
          {busy ? "Saving…" : division ? "Save" : "Add division"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
        {division && (
          <>
            {games > 0 && (
              <Pill
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!confirm(`Clear ${division.name}'s ${games} games, with their times and scores?`)) return;
                  if (await act(() => clearDivisionGames(wid, division.id))) onClose();
                }}
              >
                Clear its games
              </Pill>
            )}
            <Pill
              variant="ghost"
              disabled={busy}
              style={{ marginLeft: "auto", color: "var(--gw-error)" }}
              onClick={async () => {
                if (!confirm(`Delete ${division.name}? Its games go too; its teams stay, without a division.`)) return;
                if (await act(() => deleteDivision(wid, division.id))) onClose();
              }}
            >
              <Icons.Trash width={12} height={12} /> Delete
            </Pill>
          </>
        )}
      </div>
    </Sheet>
  );
}

function TeamSheet({
  wid,
  team,
  division,
  divisions,
  feesLocked,
  lockNote,
  onClose,
}: {
  wid: string;
  team: HostedTeam | null;
  division: string | null;
  divisions: HostedDivision[];
  feesLocked: boolean;
  lockNote: string;
  onClose: () => void;
}) {
  const { busy, error, act } = useAct();
  const [f, setF] = useState({
    name: team?.name ?? "",
    code: team?.code ?? "",
    division_id: team?.division_id ?? division ?? "",
    seed: team?.seed ? String(team.seed) : "",
    fee: team?.fee_cents != null ? (team.fee_cents / 100).toFixed(team.fee_cents % 100 ? 2 : 0) : "",
    ours: team?.ours ?? false,
    note: team?.note ?? "",
  });
  return (
    <Sheet eyebrow="Teams" title={team ? team.name : "Add a team"} busy={busy} onClose={onClose}>
      <Input label="Team" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="KC Metro Mavericks 1" autoFocus={!team} />
      <div style={grid2}>
        <Input label="Short name" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="KCM 1" />
        <Input label="Seed" inputMode="numeric" value={f.seed} onChange={(e) => setF({ ...f, seed: e.target.value })} placeholder="1" help="1 is the top seed. Brackets pair 1 v 8, 4 v 5, 2 v 7, 3 v 6." />
      </div>
      <Select label="Division" value={f.division_id} onChange={(e) => setF({ ...f, division_id: e.target.value })}>
        <option value="">Not in one yet</option>
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Input
        label="Fee ($)"
        inputMode="decimal"
        value={f.fee}
        onChange={(e) => setF({ ...f, fee: e.target.value })}
        placeholder="The team fee"
        readOnly={feesLocked}
        help={feesLocked ? lockNote : "Leave blank for the tournament's team fee; 0 for none."}
        style={feesLocked ? { background: "var(--gw-bg-elev)", color: "var(--gw-fg-muted)" } : undefined}
      />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600, color: feesLocked ? "var(--gw-fg-muted)" : undefined }}>
        <input type="checkbox" checked={f.ours} disabled={feesLocked} onChange={(e) => setF({ ...f, ours: e.target.checked })} style={{ width: 16, height: 16, accentColor: "var(--rsd-accent-fill)" }} />
        One of our teams (no fee)
      </label>
      <Textarea label="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Don't schedule at the same time as their varsity" />
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill variant="accent" onClick={async () => (await act(() => saveTeam(wid, { id: team?.id, ...f, division_id: f.division_id || null }))) && onClose()} disabled={busy || !f.name.trim()}>
          {busy ? "Saving…" : team ? "Save" : "Add team"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
        {team && (
          <Pill
            variant="ghost"
            disabled={busy}
            style={{ marginLeft: "auto", color: "var(--gw-error)" }}
            onClick={async () => {
              if (!confirm(`Take ${team.name} out of the tournament? Its games stay, with the team left blank.`)) return;
              if (await act(() => deleteTeam(wid, team.id))) onClose();
            }}
          >
            <Icons.Trash width={12} height={12} /> Remove
          </Pill>
        )}
      </div>
    </Sheet>
  );
}
