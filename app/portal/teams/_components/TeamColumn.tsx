"use client";
import { useDroppable } from "@dnd-kit/core";
import type { OlbTeam, OlbPlayer, OlbCoach } from "../../../../lib/teams/types";
import PlayerCard from "./PlayerCard";
import CoachChip from "./CoachChip";

function targetState(count: number, team: OlbTeam): "ok" | "under" | "over" | null {
  if (team.target_size == null) return null;
  const lo = team.min_size ?? team.target_size;
  const hi = team.max_size ?? team.target_size;
  if (count > hi) return "over";
  if (count < lo) return "under";
  return "ok";
}

export default function TeamColumn({
  team,
  players,
  coaches,
  onTapPlayer,
  onTapCoach,
  onEditTeam,
}: {
  team: OlbTeam | null;
  players: OlbPlayer[];
  coaches: OlbCoach[];
  onTapPlayer: (p: OlbPlayer) => void;
  onTapCoach: (c: OlbCoach) => void;
  onEditTeam?: (team: OlbTeam) => void;
}) {
  const isPool = team === null;
  const { setNodeRef, isOver } = useDroppable({ id: team ? team.id : "unassigned" });

  const count = players.length;
  const st = team ? targetState(count, team) : null;
  const colorKey = team?.color ? team.color.toLowerCase() : undefined;

  return (
    <section
      ref={setNodeRef}
      className={"olb-col" + (isPool ? " olb-pool" : "") + (isOver ? " olb-col--over" : "")}
      data-color={colorKey}
    >
      <header className="olb-col__head">
        <div className="olb-col__title">
          {team?.color && <span className="olb-chip" data-color={colorKey}>{team.color}</span>}
          <span className="olb-col__name">{team ? team.name : "Unassigned"}</span>
          {team && onEditTeam && (
            <button className="olb-iconbtn" title="Edit team" aria-label="Edit team" onClick={() => onEditTeam(team)}>✎</button>
          )}
        </div>
        {team && (team.grade_label || team.division) && (
          <div className="olb-col__meta">{[team.grade_label, team.division].filter(Boolean).join(" · ")}</div>
        )}
        <div className="olb-col__count">
          <span>
            {count}
            {team?.target_size != null ? ` / ${team.target_size}` : ""} player{count === 1 ? "" : "s"}
          </span>
          {st && <span className={`olb-flag olb-flag--${st}`}>{st === "ok" ? "On target" : st === "under" ? "Under" : "Over"}</span>}
        </div>
      </header>

      {(!isPool || coaches.length > 0) && (
        <div className="olb-coaches">
          {coaches.map((c) => <CoachChip key={c.id} coach={c} onTap={() => onTapCoach(c)} />)}
          {!isPool && coaches.length === 0 && <span className="olb-muted" style={{ fontSize: 11 }}>No coaches</span>}
        </div>
      )}

      <div className="olb-list">
        {players.map((p) => <PlayerCard key={p.id} player={p} onTap={() => onTapPlayer(p)} />)}
        {players.length === 0 && <div className="olb-empty">{isPool ? "All players assigned" : "Drop players here"}</div>}
      </div>
    </section>
  );
}
