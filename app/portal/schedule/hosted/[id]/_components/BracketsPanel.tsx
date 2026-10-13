"use client";
// The Brackets tab: each bracket division as rounds side by side, the way
// the JV bracket sheet draws it (Game 5: Winner Game 1 v Winner Game 2…,
// Game 9 for first and second), and each pool's standings. Tap a game to
// enter its score: the winner and loser move on by themselves.

import { useState } from "react";
import { Pill } from "../../../../../components/ui";
import { formatDay, formatTime, sideLabel } from "../../../../../../lib/hosted/logic";
import type { HostedDivision, HostedGame, HostedPageData } from "../../../../../../lib/hosted/types";
import { Empty, Section, cap, sub } from "./parts";
import { GameSheet, divisionTint } from "./SchedulePanel";

export function BracketsPanel({ data }: { data: HostedPageData }) {
  const [open, setOpen] = useState<HostedGame | null>(null);
  const { divisions, games } = data;
  if (divisions.length === 0) {
    return (
      <Section title="Brackets" tour="hosted-brackets">
        <Empty>Add divisions and teams on the Teams tab, then press Make the games.</Empty>
      </Section>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} data-tour="hosted-brackets">
      {divisions.map((d) => {
        const mine = games.filter((g) => g.division_id === d.id).sort((a, b) => a.round - b.round || a.game_no - b.game_no);
        return (
          <Section
            key={d.id}
            title={`${d.name}${d.code ? ` (${d.code})` : ""}`}
            subtitle={d.format === "bracket" ? "Bracket · tap a game for its score" : "Pool · standings by wins, then point differential"}
            action={
              <Pill size="sm" variant="ghost" onClick={() => window.print()}>
                Print
              </Pill>
            }
          >
            {mine.length === 0 ? (
              <Empty>No games yet. Press Make the games on the Teams tab.</Empty>
            ) : d.format === "bracket" ? (
              <Bracket data={data} division={d} games={mine} onOpen={setOpen} />
            ) : (
              <Pool data={data} division={d} games={mine} onOpen={setOpen} />
            )}
          </Section>
        );
      })}
      {open && <GameSheet data={data} game={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Bracket({ data, division, games, onOpen }: { data: HostedPageData; division: HostedDivision; games: HostedGame[]; onOpen: (g: HostedGame) => void }) {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${rounds.length}, minmax(200px, 1fr))`, gap: 14, minWidth: rounds.length * 210 }}>
        {rounds.map((r, i) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-around" }}>
            <span style={cap}>{i === rounds.length - 1 && rounds.length > 1 ? "Places" : `Round ${r}`}</span>
            {games
              .filter((g) => g.round === r)
              .map((g) => (
                <GameBox key={g.id} data={data} division={division} game={g} onOpen={onOpen} />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameBox({ data, division, game, onOpen }: { data: HostedPageData; division: HostedDivision; game: HostedGame; onOpen: (g: HostedGame) => void }) {
  const tMap = new Map(data.teams.map((t) => [t.id, t]));
  const gMap = new Map(data.games.map((g) => [g.id, g]));
  const scored = game.home_score != null && game.away_score != null;
  const when = [game.plays_on && formatDay(game.plays_on, { short: true }), formatTime(game.starts_at), game.court && `Court ${game.court}`].filter(Boolean).join(" · ");
  const row = (team: string | null, from: string | null, pts: number | null, won: boolean) => (
    <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, fontWeight: won ? 800 : 600, color: team ? "var(--gw-fg)" : "var(--gw-fg-muted)" }}>
      <span>{sideLabel(team, from, tMap, gMap)}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{pts ?? ""}</span>
    </span>
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(game)}
      style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--gw-border)", background: divisionTint(data.divisions, division.id), textAlign: "left", cursor: "pointer", color: "inherit" }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--gw-fg-muted)" }}>
        Game {game.game_no}
        {game.label ? ` (${game.label})` : ""}
      </span>
      {row(game.home_team_id, game.home_from, game.home_score, scored && game.home_score! > game.away_score!)}
      {row(game.away_team_id, game.away_from, game.away_score, scored && game.away_score! > game.home_score!)}
      {when && <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>{when}</span>}
    </button>
  );
}

function Pool({ data, division, games, onOpen }: { data: HostedPageData; division: HostedDivision; games: HostedGame[]; onOpen: (g: HostedGame) => void }) {
  const teams = data.teams.filter((t) => t.division_id === division.id);
  const table = teams
    .map((t) => {
      let w = 0;
      let l = 0;
      let pf = 0;
      let pa = 0;
      for (const g of games) {
        if (g.home_score == null || g.away_score == null) continue;
        const home = g.home_team_id === t.id;
        if (!home && g.away_team_id !== t.id) continue;
        const us = home ? g.home_score : g.away_score;
        const them = home ? g.away_score : g.home_score;
        pf += us;
        pa += them;
        if (us > them) w++;
        else if (us < them) l++;
      }
      return { t, w, l, pf, pa };
    })
    .sort((a, b) => b.w - a.w || a.l - b.l || b.pf - b.pa - (a.pf - a.pa) || a.t.name.localeCompare(b.t.name));
  const left = games.filter((g) => g.home_score == null).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 360 }}>
          <thead>
            <tr>
              {["Team", "W", "L", "PF", "PA", "+/−"].map((h) => (
                <th key={h} style={{ ...cap, textAlign: h === "Team" ? "left" : "right", padding: "6px 8px", borderBottom: "1px solid var(--gw-border)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map(({ t, w, l, pf, pa }) => (
              <tr key={t.id}>
                <td style={cell}>
                  <strong>{t.name}</strong> {t.code && <span style={{ color: "var(--gw-fg-muted)" }}>{t.code}</span>}
                </td>
                {[w, l, pf, pa, pf - pa].map((n, i) => (
                  <td key={i} style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {i === 4 && n > 0 ? `+${n}` : n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={sub}>{left ? `${left} of ${games.length} games still to play.` : "Every game has a score."}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {games.map((g) => (
          <GameBox key={g.id} data={data} division={division} game={g} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: "7px 8px", borderBottom: "1px solid var(--gw-border)", fontSize: 13 };
