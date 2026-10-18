"use client";
// The Schedule tab: the facility schedule, the way the master schedule lays
// it out: a grid for each day, a row per time and a column per court, each
// game colored by its division ("HSA (OL 1 vs KCM 1)"). "Fill the courts"
// gives every game without a time the earliest open court; tap a game to
// move it, change its teams or enter the score.

import { useState } from "react";
import { Icons } from "../../../../../components/icons";
import { Input, Pill, Select } from "../../../../../components/ui";
import { addGame, deleteGame, fillTheCourts, updateGame } from "../../../../../../lib/hosted/actions";
import { daysForWeekend, formatDay, formatTime, gameLine, sideLabel, slotsFor, toMinutes } from "../../../../../../lib/hosted/logic";
import type { HostedDivision, HostedGame, HostedPageData, HostedTeam } from "../../../../../../lib/hosted/types";
import { Empty, ErrorNote, Said, Section, Sheet, cap, grid2, sub, useAct } from "./parts";

// A tint per division, in order, readable in light and dark.
const TINTS = ["rgba(59,130,246,.18)", "rgba(34,197,94,.18)", "rgba(236,72,153,.16)", "rgba(234,179,8,.22)", "rgba(168,85,247,.16)", "rgba(249,115,22,.18)", "rgba(20,184,166,.18)"];

export function divisionTint(divisions: HostedDivision[], id: string | null): string {
  const i = divisions.findIndex((d) => d.id === id);
  return i < 0 ? "var(--gw-bg)" : TINTS[i % TINTS.length];
}

export function SchedulePanel({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const [open, setOpen] = useState<HostedGame | "new" | null>(null);
  const { plan, weekend, divisions, teams, games } = data;
  const wid = weekend.id;
  const dMap = new Map(divisions.map((d) => [d.id, d]));
  const tMap = new Map(teams.map((t) => [t.id, t]));
  const gMap = new Map(games.map((g) => [g.id, g]));
  const days = daysForWeekend(weekend.starts_on, weekend.ends_on, plan.days);
  const slots = slotsFor(days, plan.game_minutes, plan.courts);
  const placed = games.filter((g) => g.plays_on && g.starts_at && g.court);
  const waiting = games.filter((g) => !(g.plays_on && g.starts_at && g.court)).sort((a, b) => a.game_no - b.game_no);
  const free = slots.length - placed.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Section
        title="Court schedule"
        tour="hosted-schedule"
        subtitle={`${games.length} ${games.length === 1 ? "game" : "games"} · ${placed.length} on the courts · ${plan.courts} ${plan.courts === 1 ? "court" : "courts"}, ${plan.game_minutes}-minute slots · ${Math.max(0, free)} open ${free === 1 ? "slot" : "slots"}`}
        action={
          <>
            <Pill size="sm" variant="accent" disabled={busy || games.length === 0} onClick={() => act(() => fillTheCourts(wid, false))}>
              Fill the courts
            </Pill>
            {placed.length > 0 && (
              <Pill
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!confirm("Take every game without a score off the courts and fill them again from the start?")) return;
                  act(() => fillTheCourts(wid, true));
                }}
              >
                Start over
              </Pill>
            )}
            <Pill size="sm" variant="ghost" onClick={() => setOpen("new")}>
              Add a game
            </Pill>
            <Pill size="sm" variant="ghost" onClick={() => window.print()}>
              <Icons.Printer width={13} height={13} /> Print
            </Pill>
          </>
        }
      >
        <Said error={error} notice={notice} />
        {games.length === 0 && <Empty>No games yet. On the Teams tab, put teams in each division and press Make the games.</Empty>}
        {divisions.length > 0 && games.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {divisions.map((d) => (
              <span key={d.id} style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: divisionTint(divisions, d.id) }}>
                {d.code || d.name} · {games.filter((g) => g.division_id === d.id).length}
              </span>
            ))}
          </div>
        )}
      </Section>

      {waiting.length > 0 && (
        <Section title="Not on a court yet" subtitle="Press Fill the courts, or tap a game to give it a time and court.">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {waiting.map((g) => (
              <button key={g.id} type="button" onClick={() => setOpen(g)} style={{ ...chip, background: divisionTint(divisions, g.division_id) }}>
                <strong>G{g.game_no}</strong> {gameLine(g, dMap, tMap, gMap)}
              </button>
            ))}
          </div>
        </Section>
      )}

      {days.map((day) => {
        const ofDay = placed.filter((g) => g.plays_on === day.date);
        const times = [...new Set([...slots.filter((s) => s.date === day.date).map((s) => s.start), ...ofDay.map((g) => toMinutes(g.starts_at) ?? 0)])].sort((a, b) => a - b);
        const courts = Math.max(plan.courts, ...ofDay.map((g) => g.court ?? 0));
        if (times.length === 0) return null;
        return (
          <Section key={day.date} title={`Facility schedule · ${formatDay(day.date)}`} subtitle={`${ofDay.length} ${ofDay.length === 1 ? "game" : "games"} · ${formatTime(day.start)} to ${formatTime(day.end)}`}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 120 + courts * 150 }}>
                <thead>
                  <tr>
                    <th style={th}>Time</th>
                    {Array.from({ length: courts }, (_, i) => (
                      <th key={i} style={th}>
                        Court {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {times.map((t) => (
                    <tr key={t}>
                      <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {formatTime(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`)}
                      </td>
                      {Array.from({ length: courts }, (_, i) => {
                        const here = ofDay.filter((g) => g.court === i + 1 && toMinutes(g.starts_at) === t);
                        return (
                          <td key={i} style={td}>
                            {here.length === 0 ? (
                              <span style={{ fontSize: 11.5, color: "var(--gw-fg-faint)", fontWeight: 600 }}>Open</span>
                            ) : (
                              here.map((g) => (
                                <button key={g.id} type="button" onClick={() => setOpen(g)} style={{ ...chip, width: "100%", background: divisionTint(divisions, g.division_id), outline: here.length > 1 ? "2px solid var(--gw-error)" : "none" }}>
                                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: "var(--gw-fg-muted)" }}>
                                    Game {g.game_no}
                                    {g.label ? ` · ${g.label}` : ""}
                                  </span>
                                  <span style={{ display: "block" }}>{gameLine(g, dMap, tMap, gMap)}</span>
                                  {g.home_score != null && (
                                    <span style={{ display: "block", fontWeight: 800 }}>
                                      {g.home_score}–{g.away_score}
                                    </span>
                                  )}
                                </button>
                              ))
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        );
      })}

      {open && <GameSheet data={data} game={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const th: React.CSSProperties = { ...cap, textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--gw-border)" };
const td: React.CSSProperties = { padding: 4, borderBottom: "1px solid var(--gw-border)", verticalAlign: "top" };
const chip: React.CSSProperties = {
  border: "1px solid var(--gw-border)",
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 600,
  textAlign: "left",
  cursor: "pointer",
  color: "var(--gw-fg)",
  lineHeight: 1.35,
};

// A game: when and where, who plays, the score.
export function GameSheet({ data, game, onClose }: { data: HostedPageData; game: HostedGame | null; onClose: () => void }) {
  const { busy, error, act } = useAct();
  const { plan, weekend, divisions, teams, games } = data;
  const wid = weekend.id;
  const days = daysForWeekend(weekend.starts_on, weekend.ends_on, plan.days);
  const tMap = new Map(teams.map((t) => [t.id, t]));
  const gMap = new Map(games.map((g) => [g.id, g]));
  const [f, setF] = useState({
    division_id: game?.division_id ?? divisions[0]?.id ?? "",
    plays_on: game?.plays_on ?? "",
    starts_at: game?.starts_at ?? "",
    court: game?.court ? String(game.court) : "",
    home_team_id: game?.home_team_id ?? "",
    away_team_id: game?.away_team_id ?? "",
    home_score: game?.home_score != null ? String(game.home_score) : "",
    away_score: game?.away_score != null ? String(game.away_score) : "",
    label: game?.label ?? "",
  });
  const up = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const pick = (division: string | null): HostedTeam[] => {
    const inIt = teams.filter((t) => t.division_id === division);
    return [...inIt, ...teams.filter((t) => t.division_id !== division)];
  };
  const options = pick(game?.division_id ?? (f.division_id || null));
  const score = (v: string) => (v.trim() === "" ? null : Number(v));

  async function save() {
    if (!game) {
      if (await act(() => addGame(wid, { division_id: f.division_id || null, home_team_id: f.home_team_id || null, away_team_id: f.away_team_id || null }))) onClose();
      return;
    }
    const ok = await act(() =>
      updateGame(wid, game.id, {
        plays_on: f.plays_on || null,
        starts_at: f.starts_at || null,
        court: f.court ? Number(f.court) : null,
        home_team_id: f.home_team_id || null,
        away_team_id: f.away_team_id || null,
        home_score: score(f.home_score),
        away_score: score(f.away_score),
        label: f.label,
      })
    );
    if (ok) onClose();
  }

  const side = (which: "home" | "away") => {
    const from = game ? (which === "home" ? game.home_from : game.away_from) : null;
    return from ? sideLabel(null, from, tMap, gMap) : null;
  };

  return (
    <Sheet eyebrow={game ? `Game ${game.game_no}` : "Schedule"} title={game ? gameLine(game, new Map(divisions.map((d) => [d.id, d])), tMap, gMap) : "Add a game"} busy={busy} onClose={onClose}>
      {!game && (
        <Select label="Division" value={f.division_id} onChange={(e) => up({ division_id: e.target.value })}>
          <option value="">None (a crossover)</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      )}
      {(["home", "away"] as const).map((which) => (
        <div key={which} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Select label={which === "home" ? "Home (book)" : "Visitor (clock)"} value={which === "home" ? f.home_team_id : f.away_team_id} onChange={(e) => up(which === "home" ? { home_team_id: e.target.value } : { away_team_id: e.target.value })}>
            <option value="">{side(which) ?? "To be decided"}</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.code ? ` (${t.code})` : ""}
              </option>
            ))}
          </Select>
          {side(which) && <span style={sub}>Filled in by the score of {side(which)!.replace(/^(Winner|Loser) /, "")}.</span>}
        </div>
      ))}
      {game && (
        <>
          <div style={grid2}>
            <Select label="Day" value={f.plays_on} onChange={(e) => up({ plays_on: e.target.value })}>
              <option value="">Not set</option>
              {days.map((d) => (
                <option key={d.date} value={d.date}>
                  {formatDay(d.date)}
                </option>
              ))}
            </Select>
            <Input label="Time" type="time" value={f.starts_at} onChange={(e) => up({ starts_at: e.target.value })} />
            <Select label="Court" value={f.court} onChange={(e) => up({ court: e.target.value })}>
              <option value="">Not set</option>
              {Array.from({ length: Math.max(plan.courts, game.court ?? 0) }, (_, i) => (
                <option key={i} value={i + 1}>
                  Court {i + 1}
                </option>
              ))}
            </Select>
          </div>
          <div style={grid2}>
            <Input label="Home score" inputMode="numeric" value={f.home_score} onChange={(e) => up({ home_score: e.target.value })} />
            <Input label="Visitor score" inputMode="numeric" value={f.away_score} onChange={(e) => up({ away_score: e.target.value })} />
          </div>
          <Input label="Label" value={f.label} onChange={(e) => up({ label: e.target.value })} placeholder="Crossover, Championship…" />
        </>
      )}
      {error && <ErrorNote text={error} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : game ? "Save" : "Add game"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
        {game && (
          <Pill
            variant="ghost"
            disabled={busy}
            style={{ marginLeft: "auto", color: "var(--gw-error)" }}
            onClick={async () => {
              if (!confirm(`Delete Game ${game.game_no}?`)) return;
              if (await act(() => deleteGame(wid, game.id))) onClose();
            }}
          >
            <Icons.Trash width={12} height={12} /> Delete
          </Pill>
        )}
      </div>
    </Sheet>
  );
}
